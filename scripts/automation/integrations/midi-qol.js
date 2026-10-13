import { BaseAdapter } from "./base-adapter.js";
import { FLAG_SCOPE, FLAGS } from "../../core/constants.js";

/**
 * Midi-QOL adapter (verified against midi-qol 14.6.2 sources targeting dnd5e 6.0.6).
 *
 * Verified facts used here:
 *  - `globalThis.MidiQOL` exposes `Workflow`, `applyTokenDamage`, `completeActivityUse`.
 *  - Item on-use macros are read from `flags.midi-qol.onUseMacroName` as a comma list of
 *    `[pass]name` entries; `name` may be `function.<path>` which Midi resolves by evaluating
 *    `return await <path>({ speaker, actor, token, character, item, rolledItem, macroItem, args, scope, workflow })`.
 *  - The `damageBonus` pass expects `{ damageRoll, damageType, flavor }` (or an array) and rolls it
 *    as an extra DamageRoll — i.e. bonus damage is owned by Midi when active.
 *  - Workflow hooks: `midi-qol.preCheckHits`, `midi-qol.AttackRollComplete`, `midi-qol.DamageRollComplete`,
 *    `midi-qol.preDamageApplication`, `midi-qol.postActiveEffects`, `midi-qol.RollComplete`, plus
 *    `midi-qol.pre<State>` / `midi-qol.post<State>` for each workflow state.
 */
export class MidiQolAdapter extends BaseAdapter {
  id = "midi-qol";

  name = "Midi-QOL";

  minVersion = "14.6.0";

  verifiedVersion = "14.6.2";

  capabilities = [
    { id: "midi.workflow", priority: 10, description: "Attack/damage/save workflow with hit and save results" },
    { id: "midi.damageBonus", priority: 10, description: "Per-hit bonus damage through the damageBonus on-use pass" },
    { id: "midi.flags", priority: 10, description: "Advantage/disadvantage and grants flags" },
    { id: "midi.applyDamage", priority: 10, description: "applyTokenDamage with resistances" }
  ];

  apiNotes = [
    "flags.midi-qol.onUseMacroName = \"[damageBonus]function.StatBlockImporter.midi.damageBonus\"",
    "Hooks: midi-qol.DamageRollComplete(workflow), midi-qol.RollComplete(workflow)",
    "MidiQOL.applyTokenDamage(damageDetail, total, targets, item, saves, options)"
  ];

  verifyApi() {
    const problems = [];
    const M = globalThis.MidiQOL;
    if ( !M ) problems.push("globalThis.MidiQOL is not defined.");
    else {
      if ( typeof M.applyTokenDamage !== "function" ) problems.push("MidiQOL.applyTokenDamage missing.");
      if ( !M.Workflow ) problems.push("MidiQOL.Workflow missing.");
    }
    return { ok: problems.length === 0, problems };
  }

  /**
   * The on-use macro entry that routes the damageBonus pass to the module runtime.
   * Module code owns the function; nothing from imported text reaches it.
   */
  static DAMAGE_BONUS_ENTRY = "[damageBonus]function.StatBlockImporter.midi.damageBonus";

  /**
   * Item data additions required for conditional on-hit mechanics. Pure: returns a flag patch.
   * Idempotent: the entry is only added once.
   * @param {object} itemData
   * @returns {object} update data (possibly empty)
   */
  static onUseFlagPatch(itemData) {
    const specs = itemData?.flags?.[FLAG_SCOPE]?.[FLAGS.MECHANICS] ?? [];
    const needs = specs.some(s => s.kind === "damage.bonus-on-hit" && s.implementation?.owner === "midi-qol" && s.enabled !== false);
    const current = String(itemData?.flags?.["midi-qol"]?.onUseMacroName ?? "");
    const parts = current.split(",").map(s => s.trim()).filter(Boolean);
    const has = parts.includes(MidiQolAdapter.DAMAGE_BONUS_ENTRY);
    if ( needs && !has ) return { "flags.midi-qol.onUseMacroName": [...parts, MidiQolAdapter.DAMAGE_BONUS_ENTRY].join(",") };
    if ( !needs && has ) return { "flags.midi-qol.onUseMacroName": parts.filter(p => p !== MidiQolAdapter.DAMAGE_BONUS_ENTRY).join(",") };
    return {};
  }

  /** Apply the on-use flag to item data in place (used by the importer before creation). */
  static prepareItemData(itemData) {
    const patch = MidiQolAdapter.onUseFlagPatch(itemData);
    for ( const [k, v] of Object.entries(patch) ) foundry.utils.setProperty(itemData, k, v);
    return itemData;
  }
}

export default MidiQolAdapter;
