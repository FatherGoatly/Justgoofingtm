import { MECHANIC_CATEGORY } from "../core/constants.js";

/**
 * Catalogue of mechanic kinds the interpreter can produce and the runtime can implement.
 *
 * Each kind documents: the trigger it needs, the effect shape, which implementation owners can
 * realise it (in priority order) and the capabilities each owner requires. The automation layer uses
 * this table to pick the smallest suitable implementation and to describe limitations to the user.
 *
 * Owners:
 *   native     – expressed purely through dnd5e document data (activities, uses, damage parts).
 *   effect     – an ActiveEffect with validated changes/statuses (declarative).
 *   midi-qol   – Midi-QOL workflow hook / on-use function.
 *   module     – module-owned runtime handler registered on documented dnd5e hooks.
 *   macro      – generated interactive wrapper macro calling the runtime.
 *   manual     – not automated; description preserved and flagged.
 */
export const MECHANIC_KINDS = Object.freeze({
  "damage.bonus-on-hit": {
    label: "Extra damage on hit",
    trigger: "hit",
    owners: [
      { owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "unconditional", notes: "Added as a damage part of the attack activity; rolled with the weapon damage." },
      { owner: "native-alt-activity", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "toggle", notes: "A second attack activity (e.g. 'Attack (Flaming)') carries the extra damage." },
      { owner: "midi-qol", category: MECHANIC_CATEGORY.INTEGRATION, requires: ["midi.damageBonus"], when: "conditional", notes: "Evaluated per hit by a module-owned damage bonus function." },
      { owner: "module", category: MECHANIC_CATEGORY.MODULE, requires: ["dnd5e.preRollDamageV2"], when: "conditional", notes: "Added to the damage roll by the module when the targeted creature matches the condition." }
    ]
  },
  "damage.save": {
    label: "Save-based damage",
    trigger: "use",
    owners: [{ owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Save activity with DC, damage parts and half-on-save." }]
  },
  "condition.on-failed-save": {
    label: "Condition on failed save",
    trigger: "save.fail",
    owners: [
      { owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Save activity applies a status effect; dnd5e chat card applies it on failure (Midi-QOL applies it automatically)." }
    ]
  },
  "condition.on-hit": {
    label: "Condition on hit",
    trigger: "hit",
    owners: [
      { owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Status effect attached to the attack activity; applied from the chat card (automatically under Midi-QOL)." }
    ]
  },
  "resource.charges": {
    label: "Charges",
    trigger: "use",
    owners: [{ owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Item uses with recovery; activities consume charges." }]
  },
  "resource.limited-use": {
    label: "Limited uses",
    trigger: "use",
    owners: [{ owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Item uses with rest/day recovery." }]
  },
  "resource.recharge": {
    label: "Recharge",
    trigger: "turnStart",
    owners: [{ owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Recharge recovery rolled by the system at the start of the creature's turn." }]
  },
  "resource.destroy-on-last-charge": {
    label: "Destroyed when last charge is spent",
    trigger: "resource.empty",
    owners: [
      { owner: "module", category: MECHANIC_CATEGORY.MODULE, requires: ["dnd5e.postActivityConsumption"], when: "always", notes: "Module rolls the stated die after the last charge is spent and reports the result; destruction requires owner confirmation." }
    ]
  },
  "bonus.attack-damage": {
    label: "Magical attack/damage bonus",
    trigger: "passive",
    owners: [{ owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Weapon magicalBonus field." }]
  },
  "bonus.ac": {
    label: "Armor Class bonus",
    trigger: "passive",
    owners: [
      { owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "armor", notes: "Armor magicalBonus field." },
      { owner: "effect", category: MECHANIC_CATEGORY.DECLARATIVE, requires: [], when: "other", notes: "Transfer effect adding to system.attributes.ac.bonus while equipped/attuned." }
    ]
  },
  "bonus.saves": {
    label: "Saving throw bonus",
    trigger: "passive",
    owners: [{ owner: "effect", category: MECHANIC_CATEGORY.DECLARATIVE, requires: [], when: "always", notes: "Transfer effect adding to system.rolls.ability.save.bonus." }]
  },
  "bonus.spell-attack-dc": {
    label: "Spell attack / save DC bonus",
    trigger: "passive",
    owners: [{ owner: "effect", category: MECHANIC_CATEGORY.DECLARATIVE, requires: [], when: "always", notes: "Transfer effect adding to spell attack and save DC bonuses." }]
  },
  "trait.resistance": {
    label: "Damage resistance / immunity / vulnerability",
    trigger: "passive",
    owners: [{ owner: "effect", category: MECHANIC_CATEGORY.DECLARATIVE, requires: [], when: "always", notes: "Transfer effect adding to system.traits.dr/di/dv.value." }]
  },
  "trait.condition-immunity": {
    label: "Condition immunity",
    trigger: "passive",
    owners: [{ owner: "effect", category: MECHANIC_CATEGORY.DECLARATIVE, requires: [], when: "always", notes: "Transfer effect adding to system.traits.ci.value." }]
  },
  "trait.sense": {
    label: "Sense granted",
    trigger: "passive",
    owners: [{ owner: "effect", category: MECHANIC_CATEGORY.DECLARATIVE, requires: [], when: "always", notes: "Transfer effect upgrading a sense range." }]
  },
  "trait.speed": {
    label: "Speed granted or modified",
    trigger: "passive",
    owners: [{ owner: "effect", category: MECHANIC_CATEGORY.DECLARATIVE, requires: [], when: "always", notes: "Transfer effect on movement speeds." }]
  },
  "trait.advantage": {
    label: "Advantage / disadvantage on rolls",
    trigger: "passive",
    owners: [
      { owner: "effect", category: MECHANIC_CATEGORY.DECLARATIVE, requires: [], when: "unconditional", notes: "Transfer effect setting the roll advantage mode." },
      { owner: "midi-qol", category: MECHANIC_CATEGORY.INTEGRATION, requires: ["midi.flags"], when: "conditional", notes: "Midi-QOL advantage flag with condition." },
      { owner: "manual", category: MECHANIC_CATEGORY.UNRESOLVED, requires: [], when: "conditional", notes: "Situational advantage is left to the player; the description is preserved." }
    ]
  },
  "healing.use": {
    label: "Healing on use",
    trigger: "use",
    owners: [{ owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Heal activity." }]
  },
  "healing.temp-hp": {
    label: "Temporary hit points on use",
    trigger: "use",
    owners: [{ owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Heal activity with temphp type." }]
  },
  "spell.cast-from-item": {
    label: "Cast a spell from the item",
    trigger: "use",
    owners: [
      { owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: ["compendium.spell"], when: "spellFound", notes: "Cast activity linked to the compendium spell, consuming charges." },
      { owner: "manual", category: MECHANIC_CATEGORY.UNRESOLVED, requires: [], when: "spellMissing", notes: "Spell not found in any compendium; a utility activity consumes charges and shows the description." }
    ]
  },
  "light.emit": {
    label: "Sheds light",
    trigger: "toggle",
    owners: [
      { owner: "manual", category: MECHANIC_CATEGORY.UNRESOLVED, requires: [], when: "always", notes: "Token light is not changed automatically; the GM can set it on the token." }
    ]
  },
  "summon": {
    label: "Summon creatures",
    trigger: "use",
    owners: [
      { owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: ["compendium.actor"], when: "actorFound", notes: "Summon activity with profile linked to the creature." },
      { owner: "manual", category: MECHANIC_CATEGORY.UNRESOLVED, requires: [], when: "actorMissing", notes: "Summoned creature not found; summon profile must be configured manually." }
    ]
  },
  "teleport": {
    label: "Teleport",
    trigger: "use",
    owners: [
      { owner: "macro", category: MECHANIC_CATEGORY.INTERACTIVE, requires: ["macro"], when: "always", notes: "Interactive macro that lets the owner choose a destination; the runtime moves the token with permission checks." },
      { owner: "manual", category: MECHANIC_CATEGORY.UNRESOLVED, requires: [], when: "noMacro", notes: "Macro generation disabled; description preserved." }
    ]
  },
  "multiattack": {
    label: "Multiattack",
    trigger: "use",
    owners: [{ owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Utility activity that posts the multiattack description; individual attacks are rolled separately." }]
  },
  "legendary.resistance": {
    label: "Legendary Resistance",
    trigger: "save.fail",
    owners: [{ owner: "native", category: MECHANIC_CATEGORY.NATIVE, requires: [], when: "always", notes: "Utility activity consuming the legendary resistance resource." }]
  },
  "unresolved": {
    label: "Unresolved behavior",
    trigger: null,
    owners: [{ owner: "manual", category: MECHANIC_CATEGORY.UNRESOLVED, requires: [], when: "always", notes: "Description preserved; no automation generated." }]
  }
});

/**
 * Trigger events understood by the runtime, with the hook that provides them.
 * Only hooks confirmed in dnd5e 6.0.6 / Midi-QOL 14.6 are listed.
 */
export const TRIGGER_EVENTS = Object.freeze({
  "attack.before": { hooks: ["dnd5e.preRollAttackV2"], midi: "midi-qol.preAttackRoll" },
  "attack.after": { hooks: ["dnd5e.rollAttackV2"], midi: "midi-qol.AttackRollComplete" },
  hit: { hooks: ["dnd5e.preRollDamageV2"], midi: "midi-qol.damageBonus", notes: "Without Midi-QOL the system does not know whether an attack hit; the damage roll is used as the hit signal." },
  "damage.before": { hooks: ["dnd5e.preRollDamageV2"], midi: "midi-qol.preDamageRoll" },
  "damage.after": { hooks: ["dnd5e.rollDamageV2"], midi: "midi-qol.DamageRollComplete" },
  "damage.apply": { hooks: ["dnd5e.preApplyDamage", "dnd5e.applyDamage"], midi: "midi-qol.preTargetDamageApplication" },
  "save.before": { hooks: ["dnd5e.preRollSavingThrowV2"], midi: "midi-qol.preSave" },
  "save.after": { hooks: ["dnd5e.rollSavingThrowV2"], midi: "midi-qol.postSave" },
  "save.fail": { hooks: [], midi: "midi-qol.isSaveFailure", notes: "Native: applied through the chat card." },
  use: { hooks: ["dnd5e.preUseActivity", "dnd5e.postUseActivity"], midi: "midi-qol.postActiveEffects" },
  "resource.consumed": { hooks: ["dnd5e.postActivityConsumption"], midi: null },
  "effect.created": { hooks: ["createActiveEffect"], midi: null },
  "effect.deleted": { hooks: ["deleteActiveEffect"], midi: null },
  "actor.damaged": { hooks: ["dnd5e.applyDamage"], midi: null },
  "turn.start": { hooks: ["combatTurnChange"], midi: null },
  "turn.end": { hooks: ["combatTurnChange"], midi: null },
  "round.start": { hooks: ["combatRound"], midi: null },
  rest: { hooks: ["dnd5e.restCompleted"], midi: null }
});

export function mechanicKind(kind) { return MECHANIC_KINDS[kind] ?? MECHANIC_KINDS.unresolved; }
