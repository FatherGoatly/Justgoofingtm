import diagnostics from "../core/diagnostics.js";
import { FLAG_SCOPE, FLAGS } from "../core/constants.js";
import { buildEffect } from "../documents/effect-builder.js";

/**
 * Effect service: applies and removes ActiveEffects/conditions for module-managed mechanics.
 *
 * Ownership rules:
 *  - Effects attached to dnd5e activities are applied by the system (chat card) or by Midi-QOL.
 *  - Conditions are toggled through `Actor#toggleStatusEffect` so dnd5e's condition data model and
 *    Convenient Effects (when installed and preferred) stay authoritative.
 *  - Every effect created here carries a module origin flag so duplicates are detected and cleanup
 *    is possible.
 */
export const effectService = {
  /**
   * Apply a condition (status) to an actor if it is not already active.
   * @param {Actor} actor
   * @param {string} statusId
   * @param {object} [options] { origin, duration, capability }
   */
  async applyCondition(actor, statusId, options={}) {
    if ( !actor ) return null;
    if ( actor.statuses?.has?.(statusId) ) { diagnostics.debug(`${actor.name} already has ${statusId}`); return null; }
    const adapter = options.capability?.adapter;
    if ( adapter?.applyCondition ) {
      try { return await adapter.applyCondition(actor, statusId, options); } catch (err) { diagnostics.warn(`Integration condition application failed, falling back to native`, err); }
    }
    const effect = await actor.toggleStatusEffect(statusId, { active: true });
    if ( effect && typeof effect === "object" && options.duration ) {
      await effect.update({ duration: options.duration, origin: options.origin ?? effect.origin });
    }
    return effect;
  },

  async removeCondition(actor, statusId) {
    if ( !actor?.statuses?.has?.(statusId) ) return false;
    await actor.toggleStatusEffect(statusId, { active: false });
    return true;
  },

  /**
   * Create a module-owned effect on an actor from an effect IR, unless an identical one (same
   * mechanic id and origin) already exists.
   */
  async applyEffect(actor, effectIR, { origin=null, mechanicId=null }={}) {
    if ( !actor ) return null;
    const existing = actor.effects?.find?.(e => e.getFlag?.(FLAG_SCOPE, "mechanicId") === mechanicId && e.origin === origin);
    if ( existing && mechanicId ) { diagnostics.debug("Effect already applied", { mechanicId }); return existing; }
    const { data, warnings } = buildEffect(effectIR);
    for ( const w of warnings ) diagnostics.warn(w);
    delete data._id;
    data.origin = origin;
    foundry.utils.setProperty(data, `flags.${FLAG_SCOPE}.mechanicId`, mechanicId);
    const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    return created;
  },

  /** Remove module-owned effects that came from a mechanic. */
  async removeMechanicEffects(actor, mechanicId) {
    const ids = (actor?.effects ?? []).filter(e => e.getFlag?.(FLAG_SCOPE, "mechanicId") === mechanicId).map(e => e.id);
    if ( ids.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids.length;
  },

  /** Is automation disabled on a document? */
  isDisabled(doc) { return Boolean(doc?.getFlag?.(FLAG_SCOPE, FLAGS.AUTOMATION_DISABLED)); }
};

export default effectService;
