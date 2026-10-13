import { createActivity, createDamagePart, createItem } from "../schema.js";
import { abilityKey, cleanDice, findDamageType, normalizeText, parseDurationPhrase, parseFeet, parseNumberWord } from "../text-utils.js";
import { SPELL_SCHOOLS } from "../../core/dnd5e-reference.js";
import { parseArea } from "./action-parser.js";
import { validateFormula } from "../../rules/formula-validator.js";

/**
 * Parser for spell descriptions:
 *
 *   Fireball
 *   3rd-level evocation            (or "Level 3 Evocation (Sorcerer, Wizard)")
 *   Casting Time: 1 action
 *   Range: 150 feet
 *   Components: V, S, M (a tiny ball of bat guano and sulfur)
 *   Duration: Instantaneous
 *   A bright streak flashes ...
 *   At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, ...
 */

const SCHOOL_WORDS = Object.fromEntries(Object.entries(SPELL_SCHOOLS).map(([k, v]) => [v, k]));

const LEVEL_LINE_RE = /^(?:(\d)(?:st|nd|rd|th)[ -]level\s+(\w+)(?:\s*\((ritual)\))?|(\w+)\s+cantrip|Level\s+(\d)\s+(\w+)(?:\s*\(([^)]+)\))?|Cantrip\s*\(?(\w+)?\)?|(\w+)\s+cantrip\s*\(([^)]+)\))\s*\.?$/i;

export function scoreSpellBlock(text) {
  const t = normalizeText(text);
  let score = 0;
  if ( /^\s*Casting Time\s*:/mi.test(t) ) score += 0.4;
  if ( /^\s*Range\s*:/mi.test(t) ) score += 0.2;
  if ( /^\s*Components\s*:/mi.test(t) ) score += 0.2;
  if ( /^\s*Duration\s*:/mi.test(t) ) score += 0.2;
  if ( /\b(cantrip|\d(?:st|nd|rd|th)-level|Level \d)\b/i.test(t) ) score += 0.1;
  return Math.min(1, score);
}

export function splitSpellBlocks(text) {
  const lines = normalizeText(text).split("\n");
  const starts = [];
  for ( let i = 0; i < lines.length - 1; i++ ) {
    if ( lines[i].trim() && LEVEL_LINE_RE.test(lines[i + 1].trim()) ) starts.push(i);
  }
  if ( starts.length <= 1 ) return [lines.join("\n").trim()];
  return starts.map((s, i) => lines.slice(s, starts[i + 1] ?? lines.length).join("\n").trim()).filter(Boolean);
}

/**
 * Parse a spell block into an Item IR of type "spell".
 * @param {string} text
 * @returns {object}
 */
export function parseSpellBlock(text) {
  const raw = normalizeText(text);
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  if ( !lines.length ) throw new Error("Empty spell block");
  const warnings = [];
  const name = lines[0].replace(/\*+/g, "").trim();
  const spell = { level: 0, school: "", ritual: false, classes: [], castingTime: null, range: null, components: [], materials: { value: "", consumed: false, cost: 0 }, duration: null, concentration: false, scaling: null };
  let idx = 1;
  const lvl = lines[1]?.match(LEVEL_LINE_RE);
  if ( lvl ) {
    idx = 2;
    if ( lvl[1] ) { spell.level = Number(lvl[1]); spell.school = SCHOOL_WORDS[lvl[2].toLowerCase()] ?? ""; spell.ritual = Boolean(lvl[3]); }
    else if ( lvl[4] ) { spell.level = 0; spell.school = SCHOOL_WORDS[lvl[4].toLowerCase()] ?? ""; }
    else if ( lvl[5] ) { spell.level = Number(lvl[5]); spell.school = SCHOOL_WORDS[lvl[6].toLowerCase()] ?? ""; if ( lvl[7] ) spell.classes = lvl[7].split(/,\s*/).map(s => s.trim()); }
    else if ( lvl[8] !== undefined || /^cantrip/i.test(lines[1]) ) { spell.level = 0; spell.school = SCHOOL_WORDS[(lvl[8] ?? "").toLowerCase()] ?? ""; }
    else if ( lvl[9] ) { spell.level = 0; spell.school = SCHOOL_WORDS[lvl[9].toLowerCase()] ?? ""; spell.classes = lvl[10].split(/,\s*/); }
  } else warnings.push("No level/school line found; defaulting to a cantrip with unknown school.");

  const descLines = [];
  for ( ; idx < lines.length; idx++ ) {
    const line = lines[idx];
    const kv = line.match(/^(Casting Time|Range|Components|Duration|Classes|School|Level)\s*:\s*(.*)$/i);
    if ( kv && !descLines.length ) {
      const key = kv[1].toLowerCase();
      const value = kv[2].trim();
      if ( key === "casting time" ) spell.castingTime = parseCastingTime(value);
      else if ( key === "range" ) spell.range = parseRange(value);
      else if ( key === "components" ) parseComponents(value, spell);
      else if ( key === "duration" ) { spell.duration = parseDurationPhrase(value.replace(/concentration,?\s*(up to)?/i, "")) ?? { value: "", units: "spec" }; spell.concentration = /concentration/i.test(value); if ( /ritual/i.test(value) ) spell.ritual = true; }
      else if ( key === "classes" ) spell.classes = value.split(/,\s*/);
      continue;
    }
    descLines.push(line);
  }
  if ( /\(ritual\)/i.test(lines[1] ?? "") ) spell.ritual = true;
  const description = descLines.join("\n");
  const higher = description.match(/(?:At Higher Levels\.?|Using a Higher-Level Spell Slot\.?|Cantrip Upgrade\.?)\s*(.*)/i);
  const activities = buildSpellActivities(name, description, spell, higher ? higher[1] : null, warnings);

  const item = createItem({
    itemType: "spell",
    name,
    description: { original: description },
    source: { format: "text", text: raw },
    properties: [...spell.components, ...(spell.concentration ? ["concentration"] : []), ...(spell.ritual ? ["ritual"] : [])],
    activation: spell.castingTime ?? { type: "action", value: null, condition: "" },
    spell: {
      level: spell.level,
      school: spell.school,
      range: spell.range ?? { value: null, units: "self" },
      duration: spell.duration ?? { value: "", units: "inst" },
      concentration: spell.concentration,
      ritual: spell.ritual,
      materials: spell.materials,
      classes: spell.classes,
      method: "spell",
      prepared: 0
    },
    activities,
    warnings
  });
  item.confidence = lvl ? 0.95 : 0.6;
  return item;
}

function parseCastingTime(value) {
  const v = value.toLowerCase();
  const cond = v.match(/reaction,?\s*(?:which you take\s*)?(.*)$/);
  if ( /bonus action/.test(v) ) return { type: "bonus", value: 1, condition: "" };
  if ( /reaction/.test(v) ) return { type: "reaction", value: 1, condition: cond ? cond[1].trim() : "" };
  const m = v.match(/(\d+)\s*(action|minute|hour|day)s?/);
  if ( m ) {
    const type = m[2] === "action" ? "action" : m[2];
    return { type, value: Number(m[1]), condition: "" };
  }
  if ( /action/.test(v) ) return { type: "action", value: 1, condition: "" };
  return { type: "special", value: null, condition: value };
}

function parseRange(value) {
  const v = value.toLowerCase();
  if ( /^self/.test(v) ) {
    const area = parseArea(value);
    return { value: null, units: "self", area };
  }
  if ( /^touch/.test(v) ) return { value: null, units: "touch" };
  if ( /^sight/.test(v) ) return { value: null, units: "spec", special: "Sight" };
  if ( /^unlimited/.test(v) ) return { value: null, units: "any" };
  const ft = parseFeet(value);
  if ( ft !== null ) return { value: ft, units: "ft" };
  const mi = v.match(/(\d+)\s*miles?/);
  if ( mi ) return { value: Number(mi[1]), units: "mi" };
  return { value: null, units: "spec", special: value };
}

function parseComponents(value, spell) {
  const v = value;
  if ( /\bV\b/.test(v) ) spell.components.push("vocal");
  if ( /\bS\b/.test(v) ) spell.components.push("somatic");
  if ( /\bM\b/.test(v) ) {
    spell.components.push("material");
    const mat = v.match(/M\s*\(([^)]*)\)/);
    if ( mat ) {
      spell.materials.value = mat[1].trim();
      spell.materials.consumed = /consume/i.test(mat[1]);
      const cost = mat[1].match(/(\d[\d,]*)\s*(?:\+\s*)?gp/i);
      if ( cost ) spell.materials.cost = Number(cost[1].replace(/,/g, ""));
    }
  }
}

function parseScaling(higherText, spell) {
  if ( !higherText ) return null;
  const t = higherText.replace(/[−–]/g, "-");
  const m0 = t.match(/(?:damage|healing)\s+increases by\s+(\d*d\d+)\s+for each (?:spell )?slot level above/i);
  let m = m0;
  if ( m ) return { mode: "whole", number: parseInt(m[1], 10) || 1, formula: "" };
  m = t.match(/increases by\s+(\d*d\d+)\s+for every two slot levels above/i);
  if ( m ) return { mode: "half", number: parseInt(m[1], 10) || 1, formula: "" };
  m = t.match(/(?:damage|healing)\s+increases by\s+(\d*d\d+)\s+when you reach/i);
  if ( m && spell.level === 0 ) return { mode: "whole", number: parseInt(m[1], 10) || 1, formula: "", cantrip: true };
  m = t.match(/(?:damage|healing)\s+increases by\s+(\d*d\d+)\s+for each spell slot level above|increases by\s+(\d*d\d+)\s+for each slot level/i);
  if ( m ) return { mode: "whole", number: parseInt(m[1] ?? m[2], 10) || 1, formula: "" };
  m = t.match(/you can target (?:one|\w+) additional (?:creature|target|humanoid)s? for each (?:spell )?slot level above/i);
  if ( m ) return { mode: "targets", number: 1, formula: "" };
  return { mode: "unknown", text: higherText };
}

function buildSpellActivities(name, description, spell, higherText, warnings) {
  const activities = [];
  const text = description.replace(/[−–]/g, "-");
  const scaling = parseScaling(higherText, spell);
  const area = spell.range?.area ?? parseArea(text);
  const targetDefaults = area
    ? { template: { type: area.type, size: String(area.size), width: area.width ? String(area.width) : "", units: "ft" }, affects: { type: "creature", count: "" } }
    : { affects: { type: "creature", count: "1" } };
  const baseRange = spell.range?.units === "self" && area ? { units: "self" } : (spell.range ?? { units: "self" });
  const activation = spell.castingTime ?? { type: "action" };
  const duration = spell.duration ?? { value: "", units: "inst" };

  // Saving throw spells
  const save = text.match(/(?:must (?:succeed on|make) a|makes? a)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i)
    ?? text.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i);
  const attack = text.match(/\b(melee|ranged)\s+spell\s+attack\b/i) ?? text.match(/\bmake a (melee|ranged) attack roll\b/i);
  const dmgMatches = [...text.matchAll(/(\d*d\d+(?:\s*[+-]\s*\d+)?)\s+(\w+)\s+damage/gi)].map(m => ({ formula: cleanDice(m[1]), type: findDamageType(m[2]) })).filter(d => validateFormula(d.formula).valid);
  const heal = text.match(/regains?\s+(?:a number of\s+)?hit points equal to\s+(\d*d\d+(?:\s*[+-]\s*\d+)?)\s*(\+\s*your spellcasting ability modifier)?/i)
    ?? text.match(/regains?\s+(\d*d\d+(?:\s*[+-]\s*\d+)?)\s+hit points/i);
  const tempHp = text.match(/gains?\s+(\d*d\d+(?:\s*[+-]\s*\d+)?|\d+)\s+temporary hit points/i);

  const damageParts = dmgMatches.length ? [createDamagePart({ formula: dmgMatches[0].formula, types: dmgMatches[0].type ? [dmgMatches[0].type] : [], scaling: scaling && ["whole", "half"].includes(scaling.mode) ? { mode: scaling.mode, number: scaling.number, formula: "" } : null })] : [];

  if ( save ) {
    const onSave = /half as much damage|half damage/i.test(text) ? "half" : "none";
    activities.push(createActivity({
      type: "save", activation, duration, range: baseRange, target: targetDefaults,
      save: { ability: [abilityKey(save[1])], dc: { calculation: "spellcasting", formula: "" }, onSave },
      damage: damageParts, sourceText: text.slice(0, 300)
    }));
  } else if ( attack ) {
    activities.push(createActivity({
      type: "attack", activation, duration, range: baseRange, target: { affects: { type: "creature", count: "1" } },
      attack: { type: attack[1].toLowerCase(), classification: "spell", ability: "spellcasting", bonus: "", flat: false },
      damage: damageParts, includeBase: false, sourceText: text.slice(0, 300)
    }));
  } else if ( heal ) {
    const formula = cleanDice(heal[1]) + (heal[2] ? " + @mod" : "");
    activities.push(createActivity({
      type: "heal", activation, duration, range: baseRange, target: targetDefaults,
      healing: createDamagePart({ formula, types: ["healing"], scaling: scaling && ["whole", "half"].includes(scaling.mode) ? { mode: scaling.mode, number: scaling.number, formula: "" } : null }),
      sourceText: heal[0]
    }));
  } else if ( tempHp ) {
    activities.push(createActivity({
      type: "heal", activation, duration, range: baseRange, target: targetDefaults,
      healing: createDamagePart({ formula: cleanDice(tempHp[1]), types: ["temphp"] }), sourceText: tempHp[0]
    }));
  } else if ( damageParts.length ) {
    activities.push(createActivity({ type: "damage", activation, duration, range: baseRange, target: targetDefaults, damage: damageParts, sourceText: text.slice(0, 300) }));
  } else {
    activities.push(createActivity({ type: "utility", activation, duration, range: baseRange, target: targetDefaults, sourceText: "" }));
  }
  if ( scaling?.mode === "unknown" ) warnings.push("Higher-level scaling text was not understood; scaling must be configured manually.");
  if ( scaling?.mode === "targets" ) {
    const act = activities[0];
    act.target.affects.count = `${act.target.affects.count || 1} + @item.level - ${spell.level}`;
    act.target.affects.count = act.target.affects.count.replace(/^1 \+ @item\.level/, "@item.level + 1");
  }
  return activities;
}

export { parseNumberWord };
