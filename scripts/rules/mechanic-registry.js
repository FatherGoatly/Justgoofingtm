import { MECHANIC_KINDS, mechanicKind } from "./mechanic-specifications.js";
import { MECHANIC_CATEGORY, MECHANIC_SPEC_VERSION } from "../core/constants.js";

/**
 * Registry of mechanic specifications attached to Items. Resolves which implementation owner is
 * used for each mechanic given the available capabilities, and exposes lookups for the runtime.
 */
class MechanicRegistry {
  /** @type {Map<string, object>} mechanicId → { spec, itemUuid } */
  #byId = new Map();

  /** Clear (tests / world reload). */
  reset() { this.#byId.clear(); }

  /**
   * Register the mechanics stored on an Item document (or plain item data with flags).
   * @param {string} itemUuid
   * @param {object[]} specs
   */
  register(itemUuid, specs=[]) {
    for ( const spec of specs ) {
      if ( !spec?.id ) continue;
      this.#byId.set(spec.id, { spec, itemUuid });
    }
  }

  unregisterItem(itemUuid) {
    for ( const [id, entry] of this.#byId ) if ( entry.itemUuid === itemUuid ) this.#byId.delete(id);
  }

  get(id) { return this.#byId.get(id) ?? null; }

  /** All registered mechanics for an item. */
  forItem(itemUuid) { return [...this.#byId.values()].filter(e => e.itemUuid === itemUuid).map(e => e.spec); }

  /** All registered mechanics with a given trigger event. */
  byTrigger(event) { return [...this.#byId.values()].filter(e => e.spec.trigger?.event === event && e.spec.enabled !== false); }

  get size() { return this.#byId.size; }

  /**
   * Select the implementation for a mechanic given capabilities.
   * @param {object} spec                 Mechanic specification (IR).
   * @param {object} options
   * @param {Set<string>|function} options.capabilities   Available capability ids or predicate.
   * @param {boolean} [options.preferNative=true]
   * @param {boolean} [options.macrosAllowed=false]
   * @param {object} [options.context]    Extra context (e.g. { spellFound: true }).
   * @returns {{owner: string, category: string, notes: string, requires: string[]}}
   */
  selectImplementation(spec, { capabilities=new Set(), preferNative=true, macrosAllowed=false, context={} }={}) {
    const has = typeof capabilities === "function" ? capabilities : (id => capabilities.has(id));
    const kind = mechanicKind(spec.kind);
    const condition = spec.trigger?.condition ?? null;
    const when = spec.implementation?.when ?? (condition ? "conditional" : "unconditional");
    const candidates = kind.owners.filter(o => matchesWhen(o.when, when, context, macrosAllowed));
    const ordered = preferNative ? candidates : [...candidates].sort((a, b) => rank(a.owner) - rank(b.owner));
    for ( const o of ordered ) {
      if ( o.owner === "macro" && !macrosAllowed ) continue;
      if ( o.requires.every(r => r === "macro" ? macrosAllowed : (r.startsWith("compendium.") ? context[r] !== false : has(r))) ) {
        return { owner: o.owner, category: o.category, notes: o.notes, requires: o.requires };
      }
    }
    const manual = kind.owners.find(o => o.owner === "manual") ?? MECHANIC_KINDS.unresolved.owners[0];
    return { owner: "manual", category: MECHANIC_CATEGORY.UNRESOLVED, notes: manual.notes, requires: [] };
  }

  /** Normalize a spec to the current version, filling defaults. */
  normalize(spec) {
    return { ...spec, version: spec.version ?? MECHANIC_SPEC_VERSION, enabled: spec.enabled !== false, assumptions: spec.assumptions ?? [], notes: spec.notes ?? [] };
  }
}

function matchesWhen(ownerWhen, when, context, macrosAllowed) {
  if ( ownerWhen === "always" ) return true;
  if ( ownerWhen === when ) return true;
  if ( ownerWhen === "unconditional" && when === "toggle" ) return false;
  if ( ownerWhen in context ) return Boolean(context[ownerWhen]);
  if ( ownerWhen === "spellFound" ) return context.spellFound === true;
  if ( ownerWhen === "spellMissing" ) return context.spellFound !== true;
  if ( ownerWhen === "actorFound" ) return context.actorFound === true;
  if ( ownerWhen === "actorMissing" ) return context.actorFound !== true;
  if ( ownerWhen === "noMacro" ) return !macrosAllowed;
  if ( ownerWhen === "armor" ) return context.isArmor === true;
  if ( ownerWhen === "other" ) return context.isArmor !== true;
  return false;
}

function rank(owner) { return { native: 0, "native-alt-activity": 1, effect: 2, "midi-qol": 3, module: 4, macro: 5, manual: 9 }[owner] ?? 8; }

export const mechanicRegistry = new MechanicRegistry();
export default mechanicRegistry;
