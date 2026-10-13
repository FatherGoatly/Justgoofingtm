import { createActivity, createDamagePart, createEffect, createMechanic, irId } from "../import/schema.js";
import { MECHANIC_CATEGORY } from "../core/constants.js";
import {
  abilityKey, cleanDice, findCondition, findDamageType, findDamageTypes, parseDurationPhrase, parseFeet, parseNumberWord,
  splitSentences
} from "../import/text-utils.js";
import { validateFormula } from "./formula-validator.js";
import { CONDITIONS, CREATURE_TYPES, DAMAGE_TYPES } from "../core/dnd5e-reference.js";

/**
 * Mechanical interpretation engine.
 *
 * Reads the natural-language description of an Item IR and produces structured mechanic
 * specifications (`item.mechanics`). Where the behavior maps to native dnd5e data the interpreter
 * also edits the IR directly (adds damage parts, activities, uses, effects) because that *is* the
 * implementation. Everything else is recorded as a mechanic with a category, confidence and the
 * exact source sentence, so the review UI can show it and the runtime can implement it.
 *
 * The interpreter never invents a DC, duration, formula or resource cost. When a required value is
 * missing the mechanic is marked unresolved and reviewRequired.
 */

const ABILITY_RE = "(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)";
const DICE_RE = "(\\d*d\\d+(?:\\s*[+-]\\s*\\d+)?|\\d+)";
const TYPE_RE = `(${DAMAGE_TYPES.join("|")})`;
const CREATURE_TYPE_RE = `(${CREATURE_TYPES.join("|")}|undead|fiends?|dragons?|giants?|beasts?)`;

/**
 * Interpret all mechanics in an Item IR. Mutates and returns the item.
 * @param {object} item                 Item IR
 * @param {object} [options]
 * @param {object} [options.actor]      Owning actor IR (for context such as spell DCs).
 * @returns {object} item
 */
export function interpretItem(item, options={}) {
  if ( !item || item.kind !== "item" ) return item;
  const text = String(item.description?.original ?? "").replace(/[−–]/g, "-");
  const sentences = splitSentences(text);
  const mechanics = [];
  const ctx = { item, sentences, text, actor: options.actor ?? null, mechanics };

  recognizeMagicalBonus(ctx);
  recognizeAcBonus(ctx);
  recognizeSaveBonus(ctx);
  recognizeSpellBonus(ctx);
  recognizeResistances(ctx);
  recognizeConditionImmunity(ctx);
  recognizeSenses(ctx);
  recognizeSpeed(ctx);
  recognizeAdvantage(ctx);
  recognizeExtraDamageOnHit(ctx);
  recognizeSaveOrCondition(ctx);
  recognizeChargesAndUses(ctx);
  recognizeDestroyOnLastCharge(ctx);
  recognizeCastSpell(ctx);
  recognizeHealing(ctx);
  recognizeLight(ctx);
  recognizeSummonTeleport(ctx);
  recognizeMultiattack(ctx);
  recognizeUnhandledTriggers(ctx);

  item.mechanics = [...(item.mechanics ?? []), ...mechanics];
  for ( const c of item.contents ?? [] ) interpretItem(c, options);
  return item;
}

/**
 * Interpret an Actor IR: every embedded item plus actor-level features.
 * @param {object} actor
 * @returns {object}
 */
export function interpretActor(actor) {
  if ( !actor || actor.kind !== "actor" ) return actor;
  for ( const item of actor.items ?? [] ) interpretItem(item, { actor });
  return actor;
}

/** Generic entry point used by the pipeline. */
export function interpret(entry) {
  if ( entry?.kind === "actor" ) return interpretActor(entry);
  if ( entry?.kind === "item" ) return interpretItem(entry);
  return entry;
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

function add(ctx, data) {
  const m = createMechanic(data);
  ctx.mechanics.push(m);
  return m;
}

function transferEffect(ctx, { name, changes, statuses=[], sourceText }) {
  const eff = createEffect({ name: name ?? ctx.item.name, changes, statuses, transfer: true, duration: { units: "" }, sourceText, magical: ctx.item.properties?.includes("mgc") });
  ctx.item.effects.push(eff);
  return eff;
}

/** Conditions that merely restate "while equipped/attuned" are not situational. */
const EQUIP_CONDITION_RE = /\b(?:while|when|as long as) (?:you (?:wear|hold|wield|carry|are attuned|are wearing|are holding|are wielding)|wearing|wielding|holding|carrying|attuned|worn|it is (?:worn|held|equipped|wielded)|(?:the|this) \w+ is (?:worn|held|equipped|wielded))/i;
function isEquipCondition(cond) { return !cond || EQUIP_CONDITION_RE.test(cond); }

function conditionalText(sentence) {
  const m = sentence.match(/\b(while|when|whenever|if|against|only|unless|as long as)\b[^.]*/i);
  return m ? m[0] : null;
}

/* -------------------------------------------- */
/*  Passive bonuses                             */
/* -------------------------------------------- */

function recognizeMagicalBonus(ctx) {
  const { item, text } = ctx;
  const m = text.match(/\+\s*(\d)\s+bonus to (?:attack and damage rolls|attack rolls and damage rolls)/i);
  if ( !m ) return;
  if ( item.itemType === "weapon" ) {
    item.weapon ??= {};
    item.weapon.magicalBonus = Number(m[1]);
    if ( !item.properties.includes("mgc") ) item.properties.push("mgc");
    add(ctx, { kind: "bonus.attack-damage", label: `+${m[1]} attack and damage`, category: MECHANIC_CATEGORY.NATIVE, confidence: 1, reviewRequired: false, trigger: { event: "passive" }, effect: { bonus: Number(m[1]) }, implementation: { owner: "native", method: "system.magicalBonus", requires: [], limitations: [] }, sourceText: m[0] });
  } else {
    add(ctx, { kind: "bonus.attack-damage", label: `+${m[1]} attack and damage`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.6, reviewRequired: true, trigger: { event: "passive" }, effect: { bonus: Number(m[1]) }, sourceText: m[0], notes: ["Bonus applies to attacks made with the item, but the item is not a weapon."] });
  }
}

function recognizeAcBonus(ctx) {
  const { item, text } = ctx;
  const m = text.match(/\+\s*(\d)\s+bonus to (?:AC|Armor Class)\b([^.]*)/i);
  if ( !m ) return;
  const bonus = Number(m[1]);
  const cond = conditionalText(m[2] ?? "");
  if ( item.itemType === "equipment" && item.armor ) {
    item.armor.magicalBonus = bonus;
    if ( !item.properties.includes("mgc") ) item.properties.push("mgc");
    add(ctx, { kind: "bonus.ac", label: `+${bonus} AC`, category: MECHANIC_CATEGORY.NATIVE, confidence: 1, reviewRequired: false, trigger: { event: "passive" }, effect: { bonus }, implementation: { owner: "native", method: "system.armor.magicalBonus", requires: [], limitations: [] }, sourceText: m[0] });
    return;
  }
  if ( !isEquipCondition(cond) ) {
    add(ctx, { kind: "bonus.ac", label: `+${bonus} AC (conditional)`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.5, reviewRequired: true, trigger: { event: "passive", condition: cond }, effect: { bonus }, sourceText: m[0], notes: ["Conditional AC bonus; apply manually or toggle the generated effect."] });
    const eff = transferEffect(ctx, { changes: [{ key: "system.attributes.ac.bonus", value: String(bonus), type: "add" }], sourceText: m[0] });
    eff.disabled = true;
    return;
  }
  transferEffect(ctx, { changes: [{ key: "system.attributes.ac.bonus", value: String(bonus), type: "add" }], sourceText: m[0] });
  add(ctx, { kind: "bonus.ac", label: `+${bonus} AC`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.95, reviewRequired: false, trigger: { event: "passive" }, effect: { bonus, key: "system.attributes.ac.bonus" }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: ["Applies while the item is equipped (and attuned, if required)."] }, sourceText: m[0] });
}

function recognizeSaveBonus(ctx) {
  const { text } = ctx;
  const m = text.match(/\+\s*(\d)\s+bonus to (?:all )?saving throws\b([^.]*)/i);
  if ( !m ) return;
  const bonus = Number(m[1]);
  const cond = conditionalText(m[2] ?? "");
  if ( !isEquipCondition(cond) ) {
    add(ctx, { kind: "bonus.saves", label: `+${bonus} saving throws (conditional)`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.5, reviewRequired: true, trigger: { event: "passive", condition: cond }, effect: { bonus }, sourceText: m[0] });
    return;
  }
  transferEffect(ctx, { changes: [{ key: "system.rolls.ability.save.bonus", value: String(bonus), type: "add" }], sourceText: m[0] });
  add(ctx, { kind: "bonus.saves", label: `+${bonus} saving throws`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.95, reviewRequired: false, trigger: { event: "passive" }, effect: { bonus, key: "system.rolls.ability.save.bonus" }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: [] }, sourceText: m[0] });
}

function recognizeSpellBonus(ctx) {
  const { text } = ctx;
  const m = text.match(/\+\s*(\d)\s+bonus to (?:spell attack rolls and (?:to )?the saving throw DCs of your spells|spell attack rolls|the saving throw DCs of your spells)/i);
  if ( !m ) return;
  const bonus = Number(m[1]);
  const changes = [];
  if ( /spell attack/i.test(m[0]) ) changes.push({ key: "system.rolls.attack.msak.bonus", value: String(bonus), type: "add" }, { key: "system.rolls.attack.rsak.bonus", value: String(bonus), type: "add" });
  if ( /DC/i.test(m[0]) ) changes.push({ key: "system.bonuses.spell.dc", value: String(bonus), type: "add" });
  transferEffect(ctx, { changes, sourceText: m[0] });
  add(ctx, { kind: "bonus.spell-attack-dc", label: `+${bonus} spell attack/DC`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.9, reviewRequired: false, trigger: { event: "passive" }, effect: { bonus }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: [] }, sourceText: m[0] });
}

function recognizeResistances(ctx) {
  const { text } = ctx;
  const re = new RegExp(`\\b(?:you|the wearer|the wielder|its wearer)?\\s*(?:have|has|gain|gains|grants? you)\\s+(resistance|immunity|vulnerability) to ([^.]*?) damage`, "gi");
  let m;
  while ( (m = re.exec(text)) ) {
    const kind = m[1].toLowerCase();
    const types = findDamageTypes(m[2]);
    if ( !types.length ) continue;
    const cond = conditionalText(m[0]);
    const key = { resistance: "dr", immunity: "di", vulnerability: "dv" }[kind];
    if ( !isEquipCondition(cond) ) {
      add(ctx, { kind: "trait.resistance", label: `${kind} to ${types.join(", ")} (conditional)`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.5, reviewRequired: true, trigger: { event: "passive", condition: cond }, effect: { trait: key, types }, sourceText: m[0] });
      continue;
    }
    transferEffect(ctx, { changes: types.map(t => ({ key: `system.traits.${key}.value`, value: t, type: "add" })), sourceText: m[0] });
    add(ctx, { kind: "trait.resistance", label: `${kind} to ${types.join(", ")}`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.95, reviewRequired: false, trigger: { event: "passive" }, effect: { trait: key, types }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: [] }, sourceText: m[0] });
  }
}

function recognizeConditionImmunity(ctx) {
  const { text } = ctx;
  const m = text.match(/\b(?:you|the wearer) (?:are|is|can't be|cannot be|have immunity to|has immunity to) (?:immune to )?(?:being )?(?:the )?([a-z]+)(?:\s+condition)?\b/i);
  if ( !m ) return;
  const cond = m[1].toLowerCase();
  if ( !CONDITIONS.includes(cond) ) return;
  if ( /(?:while|when|if|against)/i.test(m[0]) && !/while (?:wearing|attuned)/i.test(text) ) {
    add(ctx, { kind: "trait.condition-immunity", label: `Immune to ${cond} (conditional)`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.4, reviewRequired: true, trigger: { event: "passive", condition: conditionalText(m[0]) }, effect: { condition: cond }, sourceText: m[0] });
    return;
  }
  transferEffect(ctx, { changes: [{ key: "system.traits.ci.value", value: cond, type: "add" }], sourceText: m[0] });
  add(ctx, { kind: "trait.condition-immunity", label: `Immune to ${cond}`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.85, reviewRequired: false, trigger: { event: "passive" }, effect: { condition: cond }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: [] }, sourceText: m[0] });
}

function recognizeSenses(ctx) {
  const { text } = ctx;
  const m = text.match(/\b(?:you have|grants? (?:you )?|gain)\s+(darkvision|blindsight|truesight|tremorsense)\s+(?:out to a range of\s+|with a range of\s+)?(\d+)\s*(?:feet|ft)/i);
  if ( !m ) return;
  const sense = m[1].toLowerCase();
  const range = Number(m[2]);
  transferEffect(ctx, { changes: [{ key: `system.attributes.senses.ranges.${sense}`, value: String(range), type: "upgrade" }], sourceText: m[0] });
  add(ctx, { kind: "trait.sense", label: `${sense} ${range} ft.`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.9, reviewRequired: false, trigger: { event: "passive" }, effect: { sense, range }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: [] }, sourceText: m[0] });
}

function recognizeSpeed(ctx) {
  const { text } = ctx;
  let m = text.match(/\b(?:you have|grants? you|gain)\s+a\s+(flying|swimming|climbing|burrowing|walking)\s+speed\s+(?:of\s+|equal to your walking speed|of\s+)?(\d+)?\s*(?:feet|ft)?/i);
  if ( m ) {
    const type = { flying: "fly", swimming: "swim", climbing: "climb", burrowing: "burrow", walking: "walk" }[m[1].toLowerCase()];
    if ( m[2] ) {
      transferEffect(ctx, { changes: [{ key: `system.attributes.movement.speeds.${type}`, value: m[2], type: "upgrade" }], sourceText: m[0] });
      add(ctx, { kind: "trait.speed", label: `${type} speed ${m[2]} ft.`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.9, reviewRequired: false, trigger: { event: "passive" }, effect: { type, value: Number(m[2]) }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: [] }, sourceText: m[0] });
    } else if ( /equal to your walking speed/i.test(m[0]) ) {
      transferEffect(ctx, { changes: [{ key: `system.attributes.movement.speeds.${type}`, value: "@attributes.movement.speeds.walk", type: "upgrade" }], sourceText: m[0] });
      add(ctx, { kind: "trait.speed", label: `${type} speed equal to walking speed`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.85, reviewRequired: false, trigger: { event: "passive" }, effect: { type, value: "@attributes.movement.speeds.walk" }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: [] }, sourceText: m[0] });
    }
    return;
  }
  m = text.match(/\byour (?:walking )?speed (?:increases|is increased) by (\d+)\s*(?:feet|ft)/i);
  if ( m ) {
    transferEffect(ctx, { changes: [{ key: "system.attributes.movement.speeds.walk", value: `+${m[1]}`, type: "add" }], sourceText: m[0] });
    add(ctx, { kind: "trait.speed", label: `+${m[1]} ft. speed`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.9, reviewRequired: false, trigger: { event: "passive" }, effect: { type: "walk", delta: Number(m[1]) }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: [] }, sourceText: m[0] });
  }
}

function recognizeAdvantage(ctx) {
  const { text } = ctx;
  const re = /\b(?:you have|grants? you|gives? you|has|have)\s+(advantage|disadvantage) on\s+([^.]*)/gi;
  let m;
  while ( (m = re.exec(text)) ) {
    const mode = m[1].toLowerCase();
    const what = m[2];
    const cond = what.match(/\b(against|while|when|if|that|to)\b.*/i)?.[0] ?? null;
    let key = null, label = null;
    if ( /saving throws?/i.test(what) ) { key = "system.rolls.ability.save.mode"; label = "saving throws"; }
    else if ( /attack rolls?/i.test(what) ) { key = "system.rolls.attack.mode"; label = "attack rolls"; }
    else if ( /initiative/i.test(what) ) { key = "system.attributes.init.roll.mode"; label = "initiative"; }
    else if ( /ability checks?/i.test(what) ) { key = "system.rolls.ability.check.mode"; label = "ability checks"; }
    else {
      const skill = what.match(/\b(Stealth|Perception|Athletics|Acrobatics|Insight|Persuasion|Deception|Intimidation|Arcana|History|Nature|Religion|Investigation|Medicine|Survival|Animal Handling|Performance|Sleight of Hand)\b/i);
      if ( skill ) { label = `${skill[1]} checks`; key = `system.skills.${skillKeyFor(skill[1])}.roll.mode`; }
    }
    if ( !key ) continue;
    const specific = /\b(against|spells and other magical effects|to avoid or end|that the|made to)\b/i.test(what);
    if ( cond || specific ) {
      add(ctx, { kind: "trait.advantage", label: `${mode} on ${label} (situational)`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.6, reviewRequired: false, enabled: false, trigger: { event: "passive", condition: cond ?? what }, effect: { mode, key }, implementation: { owner: "manual", method: null, requires: [], limitations: ["Situational advantage; the player applies it when the condition is met."] }, sourceText: m[0] });
      continue;
    }
    transferEffect(ctx, { changes: [{ key, value: mode === "advantage" ? "1" : "-1", type: "add" }], sourceText: m[0] });
    add(ctx, { kind: "trait.advantage", label: `${mode} on ${label}`, category: MECHANIC_CATEGORY.DECLARATIVE, confidence: 0.85, reviewRequired: false, trigger: { event: "passive" }, effect: { mode, key }, implementation: { owner: "effect", method: "transfer-effect", requires: [], limitations: [] }, sourceText: m[0] });
  }
}

function skillKeyFor(label) {
  return { stealth: "ste", perception: "prc", athletics: "ath", acrobatics: "acr", insight: "ins", persuasion: "per", deception: "dec", intimidation: "itm", arcana: "arc", history: "his", nature: "nat", religion: "rel", investigation: "inv", medicine: "med", survival: "sur", "animal handling": "ani", performance: "prf", "sleight of hand": "slt" }[label.toLowerCase()] ?? "prc";
}

/* -------------------------------------------- */
/*  On-hit effects                              */
/* -------------------------------------------- */

function recognizeExtraDamageOnHit(ctx) {
  const { item, sentences } = ctx;
  const attack = item.activities.find(a => a.type === "attack");
  for ( const s of sentences ) {
    const m = s.match(new RegExp(`(?:deals?|takes?|suffers?)\\s+(?:an\\s+)?(?:extra|additional)\\s+${DICE_RE}\\s+${TYPE_RE}\\s+damage`, "i"));
    if ( !m ) continue;
    const formula = cleanDice(m[1]);
    const type = m[2].toLowerCase();
    if ( !validateFormula(formula).valid ) continue;
    const hitTrigger = /\b(when you hit|on a hit|whenever you hit|any target it hits|a creature hit by|target hit by|hits? (?:a|the) (?:creature|target)|that it hits)\b/i.test(s) || /\b(hit)\b/i.test(s);
    const sourceText = m[0];
    // Conditions: toggle state ("while the sword is ablaze"), target type ("against undead"), other
    const toggle = s.match(/\bwhile (?:the \w+ is|it is|it's) (\w+)/i) ?? s.match(/\bwhile (\w+)\b/i);
    const targetType = s.match(new RegExp(`\\b(?:against|to|hits?) (?:an? |any |the )?${CREATURE_TYPE_RE}\\b`, "i"));
    const critical = /critical hit/i.test(s);
    if ( !attack ) {
      add(ctx, { kind: "damage.bonus-on-hit", label: `+${formula} ${type} on hit`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.5, reviewRequired: true, trigger: { event: "hit", condition: null }, effect: { formula, damageType: type }, sourceText, notes: ["The item has no attack activity to attach this damage to."] });
      continue;
    }
    if ( !hitTrigger ) {
      add(ctx, { kind: "damage.bonus-on-hit", label: `+${formula} ${type} (trigger unclear)`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.4, reviewRequired: true, trigger: { event: null }, effect: { formula, damageType: type }, sourceText, notes: ["Could not determine when the extra damage applies."] });
      continue;
    }
    if ( critical ) {
      attack.damage.push(createDamagePart({ formula, types: [type] }));
      const part = attack.damage.at(-1);
      part.criticalOnly = true;
      add(ctx, { kind: "damage.bonus-on-hit", label: `+${formula} ${type} on critical hit`, category: MECHANIC_CATEGORY.MODULE, confidence: 0.7, reviewRequired: true, trigger: { event: "hit", condition: "critical" }, effect: { formula, damageType: type, activityId: attack.id }, implementation: { owner: "module", method: "dnd5e.preRollDamageV2", requires: [], limitations: ["Native: the extra die is only correct on a critical hit; the module filters non-critical damage rolls when it can see the attack result."] }, sourceText });
      attack.damage.pop();
      continue;
    }
    if ( toggle && !targetType ) {
      // Alternate attack activity (what the system's own compendium does for Flame Tongue).
      const state = toggle[1].replace(/[^a-z]/gi, "");
      const alt = createActivity({
        ...structuredCloneSafe(attack),
        id: irId("act"),
        name: `Attack (${capitalize(state)})`,
        damage: [...attack.damage.map(d => createDamagePart(d)), createDamagePart({ formula, types: [type] })],
        sourceText: s
      });
      alt.visibilityRequireMagic = true;
      item.activities.push(alt);
      add(ctx, { kind: "damage.bonus-on-hit", label: `+${formula} ${type} while ${state}`, category: MECHANIC_CATEGORY.NATIVE, confidence: 0.9, reviewRequired: false, trigger: { event: "hit", condition: `while ${state}` }, effect: { formula, damageType: type, activityId: alt.id }, implementation: { owner: "native-alt-activity", method: "alternate-attack-activity", requires: [], limitations: ["Choose the alternate attack while the item is in the triggering state."], when: "toggle" }, sourceText });
      continue;
    }
    if ( targetType ) {
      const ct = targetType[1].toLowerCase().replace(/s$/, "");
      add(ctx, { kind: "damage.bonus-on-hit", label: `+${formula} ${type} vs ${ct}`, category: MECHANIC_CATEGORY.MODULE, confidence: 0.85, reviewRequired: false, trigger: { event: "hit", condition: `target.type:${ct}` }, target: { scope: "hitTarget", filter: { creatureType: ct } }, effect: { formula, damageType: type, activityId: attack.id }, implementation: { owner: null, method: null, requires: [], limitations: [], when: "conditional" }, sourceText });
      continue;
    }
    // Unconditional: native damage part
    attack.damage.push(createDamagePart({ formula, types: [type] }));
    add(ctx, { kind: "damage.bonus-on-hit", label: `+${formula} ${type} on hit`, category: MECHANIC_CATEGORY.NATIVE, confidence: 1, reviewRequired: false, trigger: { event: "hit" }, effect: { formula, damageType: type, activityId: attack.id, partIndex: attack.damage.length - 1 }, implementation: { owner: "native", method: "activity.damage.parts", requires: [], limitations: [] }, sourceText });
  }
}

function structuredCloneSafe(obj) { return JSON.parse(JSON.stringify(obj)); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* -------------------------------------------- */
/*  Save-or-condition                           */
/* -------------------------------------------- */

function recognizeSaveOrCondition(ctx) {
  const { item, sentences } = ctx;
  for ( const [i, s] of sentences.entries() ) {
    const saveM = s.match(new RegExp(`(?:DC\\s*(\\d+)\\s+${ABILITY_RE}\\s+saving throw|${ABILITY_RE}\\s+saving throw\\s*(?:\\(DC\\s*(\\d+)\\)|:\\s*DC\\s*(\\d+)|against your spell save DC|against the spell save DC)?)`, "i"));
    if ( !saveM ) continue;
    const ability = abilityKey(saveM[2] ?? saveM[3]);
    let dc = saveM[1] ?? saveM[4] ?? saveM[5] ?? null;
    const usesSpellDC = /spell save DC/i.test(s);
    const condWord = findCondition(s.replace(/saving throw/i, ""));
    const condition = condWord;
    const durationText = s.match(/\b(for \d+ (?:minute|hour|round|turn|day)s?|until the (?:end|start) of (?:its|your|the (?:target|creature)'s) next turn|for 1 minute|for the duration|until it (?:is )?(?:freed|removed)|for one minute)\b/i)?.[1] ?? sentences[i + 1]?.match(/\b(for \d+ (?:minute|hour|round|turn)s?|until the (?:end|start) of (?:its|your) next turn)\b/i)?.[1] ?? null;
    const dmg = s.match(new RegExp(`${DICE_RE}\\s+${TYPE_RE}\\s+damage`, "i"));
    const existing = item.activities.find(a => a.type === "save");
    if ( existing && existing.save.ability[0] === ability && (!condition || existing.conditionOnFail === condition || !existing.conditionOnFail) ) {
      // Already parsed as an activity; attach the condition effect natively.
      if ( condition && !existing.effects.length ) attachConditionEffect(ctx, existing, condition, durationText, s);
      continue;
    }
    if ( !ability ) continue;
    if ( !dc && !usesSpellDC && !ctx.actor?.spellcasting?.dc ) {
      add(ctx, { kind: condition ? "condition.on-failed-save" : "damage.save", label: `${ability.toUpperCase()} save (DC missing)`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.4, reviewRequired: true, trigger: { event: "use" }, effect: { ability, condition, damage: dmg ? { formula: cleanDice(dmg[1]), type: dmg[2].toLowerCase() } : null }, sourceText: s, notes: ["No saving throw DC is stated; the DC must be supplied before this can be automated."] });
      continue;
    }
    if ( usesSpellDC && !dc ) dc = null;
    const act = createActivity({
      type: "save",
      name: condition ? `${capitalize(condition)} (save)` : "Saving Throw",
      activation: item.activities[0]?.activation ?? { type: "action" },
      save: { ability: [ability], dc: usesSpellDC || !dc ? { calculation: "spellcasting", formula: "" } : { calculation: "", formula: String(dc) }, onSave: /half as much|half damage/i.test(s) ? "half" : "none" },
      damage: dmg ? [createDamagePart({ formula: cleanDice(dmg[1]), types: [dmg[2].toLowerCase()] })] : [],
      range: { units: "self" },
      target: { affects: { type: "creature", count: /each creature|every creature/i.test(s) ? "" : "1" } },
      sourceText: s
    });
    if ( condition ) { act.conditionOnFail = condition; attachConditionEffect(ctx, act, condition, durationText, s); }
    item.activities.push(act);
    add(ctx, { kind: condition ? "condition.on-failed-save" : "damage.save", label: condition ? `${capitalize(condition)} on failed ${ability.toUpperCase()} save` : `${ability.toUpperCase()} save damage`, category: MECHANIC_CATEGORY.NATIVE, confidence: dc || usesSpellDC ? 0.9 : 0.6, reviewRequired: !(dc || usesSpellDC), trigger: { event: "save.fail" }, effect: { ability, dc: dc ? Number(dc) : "spellcasting", condition, activityId: act.id, duration: durationText }, implementation: { owner: "native", method: "save-activity", requires: [], limitations: condition ? ["Condition is applied from the chat card (automatically with Midi-QOL)."] : [] }, sourceText: s, assumptions: durationText ? [] : (condition ? ["No duration stated; the condition has no automatic expiry."] : []) });
  }
}

function attachConditionEffect(ctx, activity, condition, durationText, sourceText) {
  const dur = durationText ? parseDurationPhrase(durationText) : null;
  const duration = dur ? { value: dur.value, units: dur.units, expiry: dur.expiry ?? null } : { value: "", units: "" };
  const eff = createEffect({ name: capitalize(condition), statuses: [condition], duration, transfer: false, sourceText, magical: ctx.item.properties?.includes("mgc") });
  eff.onSave = false;
  ctx.item.effects.push(eff);
  activity.effects.push({ effectId: eff.id, onSave: false });
  if ( !durationText ) activity.durationUnknown = true;
}

/* -------------------------------------------- */
/*  Resources                                   */
/* -------------------------------------------- */

function recognizeChargesAndUses(ctx) {
  const { item, text } = ctx;
  if ( item.uses?.max ) {
    const recharge = item.uses.recovery.find(r => r.period === "recharge");
    const isCharges = /charges?/i.test(text);
    add(ctx, {
      kind: recharge ? "resource.recharge" : isCharges ? "resource.charges" : "resource.limited-use",
      label: recharge ? `Recharge ${recharge.formula}-6` : `${item.uses.max} ${isCharges ? "charges" : "uses"}${item.uses.recovery[0] ? ` (${describeRecovery(item.uses.recovery[0])})` : ""}`,
      category: MECHANIC_CATEGORY.NATIVE, confidence: 1, reviewRequired: false, trigger: { event: "use" },
      resource: { max: item.uses.max, recovery: item.uses.recovery }, implementation: { owner: "native", method: "system.uses", requires: [], limitations: [] },
      sourceText: text.match(/[^.]*\bcharges?\b[^.]*\./i)?.[0] ?? ""
    });
    // Make sure activities that "expend charges" consume them
    for ( const act of item.activities ) {
      if ( act.consumption.some(c => c.type === "itemUses") ) continue;
      const costM = text.match(/expend(?:s|ing)?\s+(\d+|one|two|three)\s+(?:of its\s+)?charges?/i);
      const cost = costM ? parseNumberWord(costM[1]) ?? 1 : 1;
      if ( isCharges || item.uses.recovery.length ) act.consumption.push({ type: "itemUses", target: "", value: String(cost), scaling: null });
    }
    return;
  }
  // Limited uses in text without name suffix: "Once you use this property, you can't use it again until the next dawn"
  const m = text.match(/(?:once you (?:use(?: (?:this|the) \w+| it)?|do so)|after you use (?:it|this property)),?\s+(?:you )?can't (?:use|do so) (?:it |this property )?again until (?:the next dawn|you finish a (short|long) rest|dawn|the next day)/i)
    ?? text.match(/\b(\d+|once|twice|three times)\s*(?:per|\/)\s*(?:day|long rest|short rest)|(?:this property )?can be used (\d+|once|twice|three times) (?:per|a) day/i);
  if ( m ) {
    const n = /twice/i.test(m[0]) ? 2 : /three/i.test(m[0]) ? 3 : parseNumberWord(m[1] ?? m[2] ?? "1") ?? 1;
    const period = /short/i.test(m[0]) ? "sr" : /long rest/i.test(m[0]) ? "lr" : "dawn";
    item.uses = { max: String(n), spent: 0, recovery: [{ period, type: "recoverAll", formula: "" }], autoDestroy: false };
    for ( const act of item.activities ) if ( !act.consumption.length ) act.consumption.push({ type: "itemUses", target: "", value: "1", scaling: null });
    add(ctx, { kind: "resource.limited-use", label: `${n}/${period}`, category: MECHANIC_CATEGORY.NATIVE, confidence: 0.85, reviewRequired: false, trigger: { event: "use" }, resource: { max: String(n), recovery: item.uses.recovery }, implementation: { owner: "native", method: "system.uses", requires: [], limitations: [] }, sourceText: m[0] });
  }
}

function describeRecovery(r) {
  const p = { lr: "long rest", sr: "short rest", day: "day", dawn: "dawn", dusk: "dusk", recharge: "recharge" }[r.period] ?? r.period;
  return r.type === "formula" ? `regains ${r.formula} at ${p}` : `recovers at ${p}`;
}

function recognizeDestroyOnLastCharge(ctx) {
  const { text } = ctx;
  const m = text.match(/if you expend (?:the \w+'s |its )?last charge,?\s*roll a d(\d+)\.?\s*On a (\d+)(?:[-–](\d+))?,?\s*(?:the \w+ )?(?:crumbles|is destroyed|turns to dust|loses its magic|becomes nonmagical|cracks and is destroyed|shatters)/i);
  if ( !m ) return;
  add(ctx, { kind: "resource.destroy-on-last-charge", label: `d${m[1]} on last charge: ${m[2]}${m[3] ? `-${m[3]}` : ""} destroys`, category: MECHANIC_CATEGORY.MODULE, confidence: 0.9, reviewRequired: false, trigger: { event: "resource.empty" }, effect: { die: Number(m[1]), min: Number(m[2]), max: Number(m[3] ?? m[2]) }, implementation: { owner: "module", method: "dnd5e.postActivityConsumption", requires: [], limitations: ["The roll is made and reported in chat; the item is not deleted without owner confirmation."] }, sourceText: m[0] });
}

/* -------------------------------------------- */
/*  Spells, healing, light, summoning           */
/* -------------------------------------------- */

function recognizeCastSpell(ctx) {
  const { item, text } = ctx;
  const re = /cast (?:the\s+)?([A-Za-z'’ ]{3,40}?)\s+spell(?: from it)?(?:\s*\(([^)]*)\))?/gi;
  let m;
  const seen = new Set();
  while ( (m = re.exec(text)) ) {
    const name = m[1].trim().replace(/^(one of the following|any|a)\s+/i, "");
    if ( seen.has(name.toLowerCase()) || /following/i.test(name) ) continue;
    seen.add(name.toLowerCase());
    const costM = text.match(/expend(?:s|ing)?\s+(\d+|one|two|three)\s+(?:or more\s+)?(?:of its\s+)?charges?/i);
    const cost = costM ? parseNumberWord(costM[1]) ?? 1 : null;
    const levelM = text.match(/(\d)(?:st|nd|rd|th)-level version|level (\d) version|as a (\d)(?:st|nd|rd|th)-level spell|\(level (\d)\)/i);
    const details = m[2] ?? "";
    const dcM = details.match(/save DC\s*(\d+)/i) ?? text.match(/spell save DC\s*(\d+)/i);
    const atkM = details.match(/([+-]\d+)\s*to hit/i);
    add(ctx, { kind: "spell.cast-from-item", label: `Cast ${name}`, category: MECHANIC_CATEGORY.NATIVE, confidence: 0.8, reviewRequired: false, trigger: { event: "use" }, effect: { spellName: name, level: levelM ? Number(levelM[1] ?? levelM[2] ?? levelM[3] ?? levelM[4]) : null, dc: dcM ? Number(dcM[1]) : null, attack: atkM ? Number(atkM[1]) : null, scalingPerCharge: /increase the spell slot level by one for each additional charge/i.test(text) }, resource: cost !== null ? { cost } : null, implementation: { owner: null, method: "cast-activity", requires: ["compendium.spell"], limitations: [] }, sourceText: m[0] });
  }
  // Multi-spell lists: "you can expend charges to cast one of the following spells: fireball (3 charges), ..."
  const listM = text.match(/cast one of the following spells[^:]*:\s*([^.]+)/i);
  if ( listM ) {
    for ( const part of listM[1].split(/,\s*|\s+or\s+/) ) {
      const pm = part.trim().match(/^([A-Za-z'’ ]+?)\s*(?:\((\d+|one|two|three)\s+charges?\))?$/i);
      if ( !pm ) continue;
      const name = pm[1].trim();
      if ( !name || seen.has(name.toLowerCase()) ) continue;
      seen.add(name.toLowerCase());
      add(ctx, { kind: "spell.cast-from-item", label: `Cast ${name}`, category: MECHANIC_CATEGORY.NATIVE, confidence: 0.8, reviewRequired: false, trigger: { event: "use" }, effect: { spellName: name, level: null }, resource: pm[2] ? { cost: parseNumberWord(pm[2]) ?? 1 } : null, implementation: { owner: null, method: "cast-activity", requires: ["compendium.spell"], limitations: [] }, sourceText: part.trim() });
    }
  }
  if ( item.itemType === "spell" ) item.mechanics = (item.mechanics ?? []).filter(x => x.kind !== "spell.cast-from-item");
}

function recognizeHealing(ctx) {
  const { item, text } = ctx;
  if ( item.activities.some(a => a.type === "heal") ) {
    add(ctx, { kind: "healing.use", label: "Healing", category: MECHANIC_CATEGORY.NATIVE, confidence: 1, reviewRequired: false, trigger: { event: "use" }, effect: { formula: item.activities.find(a => a.type === "heal").healing?.formula }, implementation: { owner: "native", method: "heal-activity", requires: [], limitations: [] }, sourceText: text.match(/[^.]*regain[^.]*hit points[^.]*\./i)?.[0] ?? "" });
    return;
  }
  const temp = text.match(new RegExp(`gain(?:s)?\\s+${DICE_RE}\\s+temporary hit points`, "i"));
  if ( temp && item.itemType !== "spell" ) {
    const formula = cleanDice(temp[1]);
    const act = createActivity({ type: "heal", name: "Temporary Hit Points", activation: item.activities[0]?.activation ?? { type: "action" }, healing: createDamagePart({ formula, types: ["temphp"] }), range: { units: "self" }, target: { affects: { type: "self" } }, sourceText: temp[0] });
    item.activities.push(act);
    add(ctx, { kind: "healing.temp-hp", label: `${formula} temporary HP`, category: MECHANIC_CATEGORY.NATIVE, confidence: 0.85, reviewRequired: false, trigger: { event: "use" }, effect: { formula, activityId: act.id }, implementation: { owner: "native", method: "heal-activity", requires: [], limitations: [] }, sourceText: temp[0] });
  }
}

function recognizeLight(ctx) {
  const { text } = ctx;
  const m = text.match(/sheds? bright light in a (\d+)-foot radius and dim light for an additional (\d+) feet/i);
  if ( !m ) return;
  add(ctx, { kind: "light.emit", label: `Light ${m[1]}/${Number(m[1]) + Number(m[2])} ft.`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.9, reviewRequired: false, enabled: false, trigger: { event: "toggle" }, effect: { bright: Number(m[1]), dim: Number(m[1]) + Number(m[2]) }, implementation: { owner: "manual", method: null, requires: [], limitations: ["Token light must be set manually (no supported core API changes token light from an item without an integration)."] }, sourceText: m[0] });
}

function recognizeSummonTeleport(ctx) {
  const { text } = ctx;
  const summon = text.match(/\b(?:summon|conjure)s?\s+(?:a|an|one|up to \w+|\d+)\s+([A-Za-z ]{3,40}?)(?:\s*\(|,|\.|\s+that|\s+to)/i);
  if ( summon ) {
    add(ctx, { kind: "summon", label: `Summon ${summon[1].trim()}`, category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.6, reviewRequired: true, trigger: { event: "use" }, effect: { creatureName: summon[1].trim() }, implementation: { owner: null, method: "summon-activity", requires: ["compendium.actor"], limitations: [] }, sourceText: summon[0] });
  }
  const tele = text.match(/\bteleports?\b[^.]*(?:up to (\d+)\s*(?:feet|ft)|to an unoccupied space)[^.]*/i);
  if ( tele ) {
    add(ctx, { kind: "teleport", label: `Teleport${tele[1] ? ` up to ${tele[1]} ft.` : ""}`, category: MECHANIC_CATEGORY.INTERACTIVE, confidence: 0.7, reviewRequired: false, trigger: { event: "use" }, effect: { range: tele[1] ? Number(tele[1]) : null }, implementation: { owner: null, method: "interactive-macro", requires: ["macro"], limitations: ["The owner chooses the destination; the runtime validates distance and permissions."] }, sourceText: tele[0] });
  }
}

function recognizeMultiattack(ctx) {
  const { item, text } = ctx;
  if ( !/^multiattack$/i.test(item.name) ) return;
  const m = text.match(/makes?\s+(\w+)\s+(?:attacks|melee attacks|ranged attacks|weapon attacks|[A-Z][a-z]+ attacks)/i);
  add(ctx, { kind: "multiattack", label: "Multiattack", category: MECHANIC_CATEGORY.NATIVE, confidence: 1, reviewRequired: false, trigger: { event: "use" }, effect: { count: m ? parseNumberWord(m[1]) : null, text }, implementation: { owner: "native", method: "utility-activity", requires: [], limitations: ["Each attack is rolled separately."] }, sourceText: text });
}

/* -------------------------------------------- */
/*  Catch-all                                   */
/* -------------------------------------------- */

const TRIGGER_WORDS = /\b(when|whenever|if|while|after|before|each time|at the start of|at the end of|as a reaction|as a bonus action)\b/i;
const MECHANICAL_WORDS = /\b(damage|saving throw|attack roll|advantage|disadvantage|hit points|condition|speed|AC|armor class|resistance|immunity|charges?|regain|teleport|summon|dispel|invisible|frightened|paralyzed|stunned|restrained|grappled|prone|poisoned|charmed|blinded)\b/i;

function recognizeUnhandledTriggers(ctx) {
  const { item, sentences } = ctx;
  const covered = new Set((item.mechanics ?? []).concat(ctx.mechanics).map(m => m.sourceText).filter(Boolean));
  for ( const s of sentences ) {
    if ( [...covered].some(c => c && (s.includes(c) || c.includes(s))) ) continue;
    if ( !TRIGGER_WORDS.test(s) || !MECHANICAL_WORDS.test(s) ) continue;
    if ( item.itemType === "spell" ) continue;
    add(ctx, { kind: "unresolved", label: s.slice(0, 60) + (s.length > 60 ? "…" : ""), category: MECHANIC_CATEGORY.UNRESOLVED, confidence: 0.2, reviewRequired: false, enabled: false, trigger: { event: null, condition: s.match(TRIGGER_WORDS)?.[0] ?? null }, effect: {}, implementation: { owner: "manual", method: null, requires: [], limitations: ["Not automated; the description is preserved."] }, sourceText: s });
  }
}

export { parseFeet, findDamageType };
