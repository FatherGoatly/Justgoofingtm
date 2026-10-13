import { BaseAdapter } from "./base-adapter.js";

/**
 * Dynamic Active Effects adapter (verified against dae 14.6.1).
 *
 * Verified facts: `globalThis.DAE` exposes `addAutoFields`, `daeSpecialDurations`, `doEffects`,
 * `createSyntheticMacro`. Special durations are stored in `flags.dae.specialDuration` (array) with
 * keys such as turnStart, turnEnd, turnStartSource, turnEndSource, combatEnd, joinCombat, isAttacked,
 * isDamaged, isHit, isSave, isSaveSuccess, isSaveFailure, shortRest, longRest, newDay, zeroHP, 1Attack, 1Hit, 1Action, 1Reaction, 1Spell.
 *
 * DAE is used declaratively only: the importer adds special-duration flags to effects whose source
 * text describes a trigger-based expiry that core durations cannot express. No DAE macros are ever
 * generated from imported text.
 */
export class DaeAdapter extends BaseAdapter {
  id = "dae";

  name = "Dynamic Active Effects";

  minVersion = "14.6.0";

  verifiedVersion = "14.6.1";

  capabilities = [
    { id: "dae.specialDuration", priority: 5, description: "Trigger-based effect expiry (flags.dae.specialDuration)" },
    { id: "dae.effectKeys", priority: 5, description: "Extended effect change keys" }
  ];

  apiNotes = ["flags.dae.specialDuration: string[]", "DAE.daeSpecialDurations"];

  static SPECIAL_DURATIONS = new Set(["turnStart", "turnEnd", "turnStartSource", "turnEndSource", "combatEnd", "joinCombat", "isAttacked", "isDamaged", "isHit", "isSave", "isSaveSuccess", "isSaveFailure", "shortRest", "longRest", "newDay", "zeroHP", "1Attack", "1Hit", "1Action", "1Reaction", "1Spell"]);

  verifyApi() {
    const problems = [];
    const D = globalThis.DAE;
    if ( !D ) problems.push("globalThis.DAE is not defined.");
    else if ( !D.daeSpecialDurations ) problems.push("DAE.daeSpecialDurations missing.");
    return { ok: problems.length === 0, problems };
  }

  /**
   * Map a natural-language expiry phrase to a DAE special duration. Returns null when unknown.
   * @param {string} text
   */
  static specialDurationFor(text) {
    const t = String(text ?? "").toLowerCase();
    if ( /until (?:it|the target) takes damage|ends (?:early )?if (?:it|the target) takes damage/.test(t) ) return "isDamaged";
    if ( /until (?:you|it) (?:make|makes) an attack|ends when you attack/.test(t) ) return "1Attack";
    if ( /until (?:you|it) (?:hit|hits) with an attack|the first time you hit/.test(t) ) return "1Hit";
    if ( /end of the combat|when combat ends/.test(t) ) return "combatEnd";
    if ( /until you finish a long rest/.test(t) ) return "longRest";
    if ( /until you finish a short rest/.test(t) ) return "shortRest";
    return null;
  }

  /** Add a special duration flag to effect data (pure). */
  static withSpecialDuration(effectData, key) {
    if ( !DaeAdapter.SPECIAL_DURATIONS.has(key) ) return effectData;
    const existing = effectData.flags?.dae?.specialDuration ?? [];
    if ( existing.includes(key) ) return effectData;
    foundry.utils.setProperty(effectData, "flags.dae.specialDuration", [...existing, key]);
    return effectData;
  }
}

export default DaeAdapter;
