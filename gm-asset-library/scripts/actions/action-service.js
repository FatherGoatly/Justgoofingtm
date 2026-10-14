import diagnostics from "../core/diagnostics.js";
import { dialogs } from "./dialogs.js";
import { localize } from "../utilities/dom.js";

/**
 * Registry of context-sensitive actions.
 *
 * An action declares which records it applies to; the browser only offers actions whose
 * `available()` returns true for the current selection, so impossible actions are never shown.
 * Actions that change campaign data confirm first (inside their `run`) and report failures through
 * notifications and the diagnostics log.
 *
 * @typedef {object} AssetAction
 * @property {string} id
 * @property {string} label      i18n key
 * @property {string} icon
 * @property {string} group      "preview" | "copy" | "organize" | "use" | "document" | "health" | "danger"
 * @property {boolean} [multi]   Supports several records at once
 * @property {boolean} [mutates] Changes campaign data (shown with a warning style)
 * @property {Function} available   (records, ctx) → boolean
 * @property {Function} run         (records, ctx) → Promise<any>
 */
export class ActionService {
  #actions = new Map();

  register(action) {
    if ( !action?.id || typeof action.run !== "function" ) throw new Error("Invalid action");
    this.#actions.set(action.id, { multi: false, mutates: false, group: "use", available: () => true, ...action });
    return this;
  }

  unregister(id) { this.#actions.delete(id); }

  get(id) { return this.#actions.get(id) ?? null; }

  all() { return [...this.#actions.values()]; }

  /** Actions available for the given selection, grouped and ordered. */
  actionsFor(records, ctx) {
    const list = Array.isArray(records) ? records : [records];
    if ( !list.length ) return [];
    const out = [];
    for ( const a of this.#actions.values() ) {
      if ( list.length > 1 && !a.multi ) continue;
      try { if ( a.available(list, ctx) ) out.push(a); } catch (err) { diagnostics.debug(`available() failed for ${a.id}`, err); }
    }
    return out;
  }

  async run(id, records, ctx) {
    const action = this.#actions.get(id);
    if ( !action ) throw new Error(`Unknown action ${id}`);
    const list = Array.isArray(records) ? records : [records];
    if ( !action.available(list, ctx) ) { await dialogs.notify(localize("GMAL.Action.NotAvailable"), "warn"); return null; }
    try {
      const result = await action.run(list, ctx);
      diagnostics.debug(`Action ${id} completed`, { count: list.length });
      return result;
    } catch (err) {
      diagnostics.error(`Action ${id} failed`, err);
      diagnostics.count("actionFailures");
      await dialogs.notify(localize("GMAL.Action.Failed", { action: localize(action.label), error: err?.message ?? String(err) }), "error");
      return null;
    }
  }
}

export const GROUP_ORDER = ["preview", "copy", "organize", "use", "document", "health", "danger"];
