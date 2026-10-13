import diagnostics from "../core/diagnostics.js";
import { TRIGGER_EVENTS } from "../rules/mechanic-specifications.js";

/**
 * Trigger registry: a single set of Foundry/dnd5e hook listeners that dispatch to module handlers.
 *
 * Handlers are registered once per module load (idempotent; keyed by handler id) and every hook is
 * installed at most once. Re-importing content never adds listeners: mechanics are looked up from
 * document flags at event time.
 */
class TriggerRegistry {
  /** @type {Map<string, {event: string, handler: function, id: string, owner: string}>} */
  #handlers = new Map();

  /** @type {Map<string, number>} hookName → hook id */
  #installed = new Map();

  #active = false;

  #compatibility = null;

  get events() { return TRIGGER_EVENTS; }

  get active() { return this.#active; }

  /**
   * Register a handler for a trigger event.
   * @param {string} id        Stable handler id (duplicates replace the previous handler).
   * @param {string} event     Trigger event name from TRIGGER_EVENTS.
   * @param {function} handler (payload) → void|Promise
   * @param {object} [options] { owner: "module"|adapterId }
   */
  register(id, event, handler, options={}) {
    if ( !TRIGGER_EVENTS[event] ) throw new Error(`Unknown trigger event "${event}"`);
    this.#handlers.set(id, { id, event, handler, owner: options.owner ?? "module" });
    if ( this.#active ) this.#installHooksFor(event);
  }

  unregister(id) { this.#handlers.delete(id); }

  handlersFor(event) { return [...this.#handlers.values()].filter(h => h.event === event); }

  /**
   * Install the Foundry hooks for all registered events. Safe to call repeatedly.
   * @param {object} [compatibility]
   */
  activate(compatibility=null) {
    this.#compatibility = compatibility;
    this.#active = true;
    for ( const event of new Set([...this.#handlers.values()].map(h => h.event)) ) this.#installHooksFor(event);
    diagnostics.debug("Trigger registry active", { hooks: [...this.#installed.keys()] });
  }

  /** Remove all hooks (tests / disable). */
  deactivate() {
    for ( const [name, id] of this.#installed ) {
      try { globalThis.Hooks?.off?.(name, id); } catch (err) { diagnostics.warn(`Failed to remove hook ${name}`, err); }
    }
    this.#installed.clear();
    this.#active = false;
  }

  reset() { this.deactivate(); this.#handlers.clear(); }

  #installHooksFor(event) {
    const spec = TRIGGER_EVENTS[event];
    const midiActive = this.#compatibility?.hasCapability?.("midi.workflow");
    const names = [...spec.hooks];
    if ( midiActive && spec.midi && !spec.midi.includes("damageBonus") && !spec.midi.startsWith("midi-qol.is") ) names.push(spec.midi);
    for ( const name of names ) {
      if ( this.#installed.has(name) || !globalThis.Hooks ) continue;
      const hookId = Hooks.on(name, (...args) => this.#dispatch(name, args));
      this.#installed.set(name, hookId);
    }
  }

  async #dispatch(hookName, args) {
    const events = Object.entries(TRIGGER_EVENTS).filter(([, spec]) => spec.hooks.includes(hookName) || spec.midi === hookName).map(([e]) => e);
    for ( const event of events ) {
      for ( const h of this.handlersFor(event) ) {
        try {
          const result = h.handler({ event, hookName, args });
          if ( result === false ) return false;
          if ( result?.then ) result.catch(err => diagnostics.error(`Trigger handler ${h.id} failed`, err));
        } catch (err) {
          diagnostics.error(`Trigger handler ${h.id} failed`, err);
        }
      }
    }
    return true;
  }

  /** Fire a trigger manually (tests / integrations). */
  fire(hookName, ...args) { return this.#dispatch(hookName, args); }

  get installedHooks() { return [...this.#installed.keys()]; }
}

export const triggerRegistry = new TriggerRegistry();
export default triggerRegistry;
