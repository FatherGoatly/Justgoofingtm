import { SystemAdapter } from "../base-adapter.js";
import { satisfiesMinimum } from "../../core/compatibility.js";

/**
 * Adapter for the dnd5e system, 6.x line. Data paths and method names were read from the dnd5e 6.0.6 source
 * (module/documents/actor/actor.mjs, module/data/actor/templates/*.mjs). See COMPATIBILITY.md.
 */
export class Dnd5eAdapter extends SystemAdapter {
  static id = "dnd5e";
  static title = "Dungeons & Dragons Fifth Edition";
  static verified = { minimum: "6.0.0", verified: "6.0.6" };

  static matches(env) { return env?.system?.id === "dnd5e"; }

  get versionSupported() { return satisfiesMinimum(this.env?.system?.version, Dnd5eAdapter.verified.minimum); }

  get capabilities() {
    const caps = new Set(["actor-name", "actor-type", "hp", "ac", "abilities", "skills", "apply-damage", "temp-hp", "ability-check", "saving-throw", "skill-check", "item-use", "status-effects", "initiative"]);
    return caps;
  }

  get hpPath() { return "attributes.hp"; }

  /** Ability keys as defined in CONFIG.DND5E.abilities (core six; systems may add more at runtime). */
  get abilityKeys() { return Object.keys(globalThis.CONFIG?.DND5E?.abilities ?? { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }); }

  describeActor(actor) {
    const base = super.describeActor(actor);
    const sys = actor?.system ?? {};
    const abilities = {};
    for ( const [k, a] of Object.entries(sys.abilities ?? {}) ) abilities[k] = { value: a.value, mod: a.mod, save: a.save?.value ?? null };
    return { ...base, ac: sys.attributes?.ac?.value ?? null, level: sys.details?.level ?? null, cr: sys.details?.cr ?? null, prof: sys.attributes?.prof ?? null, abilities, notes: [] };
  }

  /**
   * Names of the supported system workflows, with the call shapes verified against dnd5e 6.0.6.
   * The academy teaches these instead of re-implementing rules.
   */
  get workflows() {
    return {
      applyDamage: { call: "await actor.applyDamage(amount)", note: "Accepts a number (ignores resistances) or [{ value, type }] descriptions (applies resistances, immunities and vulnerabilities)." },
      applyTempHP: { call: "await actor.applyTempHP(amount)", note: "Only raises temporary HP; never lowers it." },
      abilityCheck: { call: 'await actor.rollAbilityCheck({ ability: "str" })', note: "Returns an array of D20Roll (or null if cancelled). Second argument configures the dialog ({ configure: false } skips it); third configures the chat message." },
      savingThrow: { call: 'await actor.rollSavingThrow({ ability: "dex", target: 15 })', note: "Same shape as ability checks." },
      skillCheck: { call: 'await actor.rollSkill({ skill: "prc" })', note: "Skill keys are in CONFIG.DND5E.skills." },
      itemUse: { call: "await item.use()", note: "Runs the item's activities (attack, damage, save...) through the system's own usage dialog and chat card." },
      statusEffect: { call: 'await actor.toggleStatusEffect("prone")', note: "Status ids are in CONFIG.statusEffects / CONFIG.DND5E.conditionTypes." },
      initiative: { call: "await actor.rollInitiativeDialog()", note: "Or combat.rollInitiative(combatantIds) at the Combat level." }
    };
  }
}
