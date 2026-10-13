import { BaseAdapter } from "./base-adapter.js";
import diagnostics from "../../core/diagnostics.js";

/**
 * DFreds Convenient Effects adapter (verified against dfreds-convenient-effects 7.0.0, Foundry 14).
 *
 * Verified API: `game.dfreds.effectInterface` with `findEffect({ effectName })`,
 * `hasEffectApplied({ effectName, uuid })`, `addEffect({ effectName, uuid, origin })`,
 * `removeEffect({ effectName, uuid })`. The interface is created on `socketlib.ready`.
 *
 * Used to reuse an existing condition definition when a status id maps to a CE effect name. Native
 * `toggleStatusEffect` remains the fallback and the system's condition model stays authoritative.
 */
export class DfredsAdapter extends BaseAdapter {
  id = "dfreds-convenient-effects";

  name = "DFreds Convenient Effects";

  minVersion = "7.0.0";

  verifiedVersion = "7.0.0";

  capabilities = [{ id: "ce.conditions", priority: 3, description: "Reuse Convenient Effects condition definitions" }];

  apiNotes = ["game.dfreds.effectInterface.addEffect({ effectName, uuid, origin })"];

  verifyApi() {
    const problems = [];
    const api = globalThis.game?.dfreds?.effectInterface;
    if ( !api ) problems.push("game.dfreds.effectInterface is not available (created on socketlib.ready).");
    else for ( const fn of ["findEffect", "hasEffectApplied", "addEffect", "removeEffect"] ) if ( typeof api[fn] !== "function" ) problems.push(`effectInterface.${fn} missing.`);
    return { ok: problems.length === 0, problems };
  }

  /** Status id → Convenient Effects name (title case of the dnd5e condition label). */
  static effectNameFor(statusId) {
    const names = { blinded: "Blinded", charmed: "Charmed", deafened: "Deafened", frightened: "Frightened", grappled: "Grappled", incapacitated: "Incapacitated", invisible: "Invisible", paralyzed: "Paralyzed", petrified: "Petrified", poisoned: "Poisoned", prone: "Prone", restrained: "Restrained", stunned: "Stunned", unconscious: "Unconscious", exhaustion: "Exhaustion 1" };
    return names[statusId] ?? null;
  }

  /** Apply a condition through CE when it defines the effect; otherwise return null to use native. */
  async applyCondition(actor, statusId, { origin=null }={}) {
    const api = globalThis.game?.dfreds?.effectInterface;
    const effectName = DfredsAdapter.effectNameFor(statusId);
    if ( !api || !effectName || !api.findEffect({ effectName }) ) return null;
    if ( api.hasEffectApplied({ effectName, uuid: actor.uuid }) ) return null;
    diagnostics.debug(`Applying ${effectName} via Convenient Effects`);
    const docs = await api.addEffect({ effectName, uuid: actor.uuid, origin });
    return docs?.[0] ?? true;
  }
}

export default DfredsAdapter;
