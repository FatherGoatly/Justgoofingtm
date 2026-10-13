import { createActor, createItem } from "../schema.js";
import { abilityKey, normalizeText, parseAverageAndFormula, parseFeet, parseNumberWord, skillKey, titleCase } from "../text-utils.js";
import { ALIGNMENTS, CLASSES, SUBCLASS_PROGRESSION, languageKeys, proficiencyForLevel } from "../../core/dnd5e-reference.js";

/**
 * Best-effort parser for plain-text character sheets written as labelled lines:
 *
 *   Name: Thalia Brightwood
 *   Species: Half-Elf           (or Race:)
 *   Class: Fighter 5 / Wizard 2 (Eldritch Knight)
 *   Background: Soldier
 *   Alignment: Neutral Good
 *   Level: 7
 *   STR 16 DEX 14 CON 15 INT 13 WIS 10 CHA 12
 *   Saving Throws: Strength, Constitution
 *   Skills: Athletics, Perception (expertise), Intimidation
 *   Armor Class: 18
 *   Hit Points: 52 (max 60)
 *   Hit Dice: 5d10, 2d6
 *   Speed: 30 ft.
 *   Languages: Common, Elvish
 *   Proficiencies: all armor, shields, simple weapons, martial weapons, smith's tools
 *   Equipment: Longsword, Chain Mail, Shield, Potion of Healing x2, Flame Tongue Longsword
 *   Spells: Shield, Magic Missile, Fire Bolt
 *   Features: Second Wind, Action Surge, Extra Attack
 *   Feats: Sentinel
 *
 * Multiclass characters keep per-class levels and subclasses. Items referenced by name become
 * placeholder entries that are resolved against compendia at import time.
 */

const ALIGNMENT_LOOKUP = Object.fromEntries(Object.entries(ALIGNMENTS).map(([k, v]) => [v, k]));

export function scoreCharacterSheet(text) {
  const t = normalizeText(text);
  let score = 0;
  if ( /^\s*(Class|Classes)\s*:/mi.test(t) ) score += 0.4;
  if ( /^\s*(Race|Species|Ancestry)\s*:/mi.test(t) ) score += 0.2;
  if ( /^\s*(Background)\s*:/mi.test(t) ) score += 0.1;
  if ( /^\s*(Level)\s*:/mi.test(t) ) score += 0.1;
  if ( /\b(STR|Strength)\b.*\b(CHA|Charisma)\b/i.test(t) ) score += 0.2;
  if ( /^\s*Name\s*:/mi.test(t) ) score += 0.1;
  return Math.min(1, score);
}

/**
 * Parse a character sheet.
 * @param {string} text
 * @returns {object} Actor IR (actorType "character")
 */
export function parseCharacterSheet(text) {
  const raw = normalizeText(text);
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  const warnings = [];
  const fields = new Map();
  let currentKey = null;
  for ( const line of lines ) {
    const kv = line.match(/^([A-Za-z][A-Za-z /&-]{1,30})\s*:\s*(.*)$/);
    if ( kv ) { currentKey = kv[1].trim().toLowerCase(); fields.set(currentKey, [fields.get(currentKey), kv[2].trim()].filter(Boolean).join("\n")); continue; }
    const abilityLine = line.match(/\b(STR|Strength)\b/i) && line.match(/\b(CHA|Charisma)\b/i);
    if ( abilityLine ) { fields.set("__abilities", line); currentKey = null; continue; }
    if ( currentKey ) fields.set(currentKey, `${fields.get(currentKey)}\n${line}`);
    else if ( !fields.has("__name") ) fields.set("__name", line);
  }
  const get = (...keys) => { for ( const k of keys ) if ( fields.has(k) ) return fields.get(k); return null; };

  const name = get("name", "character name", "character") ?? get("__name") ?? "Unnamed Character";
  const actor = createActor({ actorType: "character", name, source: { format: "text", text: raw } });
  const character = { classes: [], species: null, background: null, level: null, xp: null, feats: [], features: [], proficiencies: { armor: [], weapons: [], tools: [], other: [] }, spells: [], equipment: [] };
  actor.character = character;

  // Abilities
  const abilityText = get("__abilities") ?? get("abilities", "ability scores");
  if ( abilityText ) {
    const re = /\b(STR|DEX|CON|INT|WIS|CHA|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b\s*:?\s*(\d+)/gi;
    let m;
    while ( (m = re.exec(abilityText)) ) {
      const key = abilityKey(m[1].toLowerCase().slice(0, 3));
      if ( key ) actor.abilities[key].value = Number(m[2]);
    }
  } else {
    for ( const key of Object.keys(actor.abilities) ) {
      const v = get(key, { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" }[key]);
      if ( v ) { const n = v.match(/\d+/); if ( n ) actor.abilities[key].value = Number(n[0]); }
    }
    if ( !Object.values(actor.abilities).some(a => a.value !== 10) ) warnings.push("No ability scores found; defaults of 10 used.");
  }

  // Classes
  const classText = get("class", "classes", "class & level", "class and level", "class/level");
  if ( classText ) {
    for ( const part of classText.split(/\s*[\/,;]\s*|\s+and\s+/i) ) {
      const m = part.match(/^([A-Za-z ]+?)\s*(\d+)?\s*(?:\(([^)]+)\))?\s*(?:level\s*(\d+))?$/i) ?? part.match(/^(?:level\s*)?(\d+)\s+([A-Za-z ]+?)(?:\s*\(([^)]+)\))?$/i);
      if ( !m ) continue;
      const isNumFirst = /^\d/.test(part.trim()) || /^level/i.test(part.trim());
      const className = (isNumFirst ? m[2] : m[1]).trim();
      const levels = Number(isNumFirst ? m[1] : (m[2] ?? m[4] ?? 1));
      const subclass = (m[3] ?? "").trim();
      const key = className.toLowerCase();
      if ( !CLASSES[key] ) warnings.push(`Unknown class "${className}"; it is imported as a custom class.`);
      character.classes.push({ name: titleCase(className), identifier: key.replace(/\s+/g, "-"), levels: Number.isFinite(levels) ? levels : 1, subclass: subclass ? titleCase(subclass) : null, hitDie: CLASSES[key]?.hd ?? "d8", progression: resolveProgression(key, subclass), spellcastingAbility: CLASSES[key]?.ability ?? SUBCLASS_PROGRESSION[subclass.toLowerCase()]?.ability ?? null });
    }
  }
  const subclassText = get("subclass", "subclasses", "archetype");
  if ( subclassText && character.classes.length === 1 && !character.classes[0].subclass ) {
    character.classes[0].subclass = titleCase(subclassText);
    character.classes[0].progression = resolveProgression(character.classes[0].identifier, subclassText);
  }
  const levelText = get("level", "total level", "character level");
  const totalFromClasses = character.classes.reduce((s, c) => s + c.levels, 0);
  character.level = levelText ? Number(levelText.match(/\d+/)?.[0] ?? totalFromClasses) : totalFromClasses;
  if ( character.classes.length && character.level !== totalFromClasses ) {
    warnings.push(`Stated level ${character.level} does not match class levels (${totalFromClasses}); class levels are used.`);
    character.level = totalFromClasses;
  }
  if ( !character.classes.length ) warnings.push("No class line found.");
  actor.proficiencyBonus = proficiencyForLevel(character.level || 1);

  character.species = get("species", "race", "ancestry", "lineage");
  character.background = get("background");
  const xp = get("xp", "experience", "experience points");
  if ( xp ) character.xp = Number(xp.match(/[\d,]+/)?.[0]?.replace(/,/g, "") ?? 0);
  const al = get("alignment");
  if ( al ) actor.alignment = titleCase(al);
  actor.size = "med";

  // Saves & skills
  const saves = get("saving throws", "saves", "saving throw proficiencies");
  if ( saves ) for ( const part of saves.split(/,\s*/) ) { const k = abilityKey(part.trim().toLowerCase().slice(0, 3)); if ( k && /^(str|dex|con|int|wis|cha)/i.test(part.trim()) ) actor.abilities[k].proficient = 1; }
  const skills = get("skills", "skill proficiencies");
  if ( skills ) for ( const part of skills.split(/,\s*/) ) {
    const m = part.trim().match(/^([A-Za-z ]+?)(?:\s*\((expertise|double|x2)\))?(?:\s*[+-]\d+)?$/i);
    if ( !m ) continue;
    const k = skillKey(m[1]);
    if ( k ) actor.skills[k] = { value: m[2] ? 2 : 1 };
    else warnings.push(`Unknown skill "${m[1]}"`);
  }
  const expertise = get("expertise");
  if ( expertise ) for ( const part of expertise.split(/,\s*/) ) { const k = skillKey(part); if ( k ) actor.skills[k] = { value: 2 }; }

  // Combat
  const ac = get("armor class", "ac");
  if ( ac ) { const n = ac.match(/\d+/); if ( n ) { actor.ac.value = Number(n[0]); actor.ac.calc = "flat"; } }
  const hp = get("hit points", "hp", "max hp");
  if ( hp ) {
    const m = hp.match(/(\d+)(?:\s*(?:\/|of|max)\s*(\d+))?/i);
    if ( m ) { actor.hp.value = Number(m[1]); actor.hp.max = m[2] ? Number(m[2]) : Number(m[1]); }
    const maxM = hp.match(/max(?:imum)?\s*(\d+)/i);
    if ( maxM ) actor.hp.max = Number(maxM[1]);
  }
  const thp = get("temporary hit points", "temp hp");
  if ( thp ) actor.hp.temp = Number(thp.match(/\d+/)?.[0] ?? 0);
  const hd = get("hit dice");
  if ( hd ) actor.hitDice = hd.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  const speed = get("speed");
  if ( speed ) {
    for ( const part of speed.split(/,\s*/) ) {
      const m = part.match(/(walk|fly|swim|climb|burrow)?\s*(\d+)\s*ft/i);
      if ( m ) actor.movement[(m[1] ?? "walk").toLowerCase()] = Number(m[2]);
    }
  }
  const init = get("initiative");
  if ( init ) { const m = init.match(/[+-]?\d+/); if ( m ) actor.initiative = Number(m[0]); }
  const senses = get("senses");
  if ( senses ) for ( const part of senses.split(/,\s*/) ) { const m = part.match(/(darkvision|blindsight|tremorsense|truesight)\s+(\d+)/i); if ( m ) actor.senses[m[1].toLowerCase()] = Number(m[2]); }
  const langs = get("languages");
  if ( langs ) {
    const keys = languageKeys();
    const labelToKey = new Map([...keys.entries()].map(([k, v]) => [v, k]));
    const custom = [];
    for ( const part of langs.split(/,\s*/) ) { const k = labelToKey.get(part.trim().toLowerCase()); if ( k ) actor.languages.value.push(k); else if ( part.trim() ) custom.push(part.trim()); }
    actor.languages.custom = custom.join("; ");
  }
  const profs = get("proficiencies", "other proficiencies", "armor & weapon proficiencies", "weapon proficiencies", "armor proficiencies", "tool proficiencies");
  if ( profs ) for ( const part of profs.split(/,\s*|\n/) ) {
    const p = part.trim().toLowerCase().replace(/\.$/, "");
    if ( !p ) continue;
    if ( /armor|shield/.test(p) ) character.proficiencies.armor.push(p);
    else if ( /weapon|sword|bow|axe|crossbow|dagger|dart|sling|staff|mace|hammer|spear|javelin|club|scimitar|rapier|whip|flail|glaive|halberd|lance|pike|trident|pick|net|blowgun|firearm|pistol|musket/.test(p) ) character.proficiencies.weapons.push(p);
    else if ( /tools|kit|supplies|utensils|instrument|set|lute|drum|flute|horn|lyre|viol|bagpipes|shawm|dulcimer|pan flute/.test(p) ) character.proficiencies.tools.push(p);
    else character.proficiencies.other.push(p);
  }
  const currency = get("currency", "money", "coins", "gold");
  if ( currency ) { for ( const m of currency.matchAll(/(\d+)\s*(pp|gp|ep|sp|cp)\b/gi) ) actor.currency[m[2].toLowerCase()] = Number(m[1]); }

  // Referenced documents
  character.equipment = parseList(get("equipment", "inventory", "items", "gear"));
  character.spells = parseList(get("spells", "spells known", "prepared spells", "spellbook", "cantrips"));
  character.features = parseList(get("features", "class features", "features & traits", "traits", "racial traits", "species traits"));
  character.feats = parseList(get("feats"));
  const sc = get("spellcasting ability", "spellcasting");
  if ( sc ) { const k = abilityKey(sc.trim().toLowerCase().slice(0, 3)); if ( k ) character.spellcastingAbility = k; }
  const bio = get("biography", "backstory", "description", "appearance", "personality");
  if ( bio ) actor.biography = bio;

  // Items as placeholders (resolved by the importer against compendia)
  for ( const e of character.equipment ) actor.items.push(placeholder(e.name, "equipment", e.quantity, e.note));
  for ( const s of character.spells ) actor.items.push(placeholder(s.name, "spell", 1, s.note));
  for ( const f of character.features ) actor.items.push(placeholder(f.name, "feat", 1, f.note, "class"));
  for ( const f of character.feats ) actor.items.push(placeholder(f.name, "feat", 1, f.note, "feat"));

  actor.warnings = warnings;
  actor.confidence = Math.max(0.3, 1 - warnings.length * 0.1);
  return actor;
}

function resolveProgression(classKey, subclass) {
  const sub = SUBCLASS_PROGRESSION[String(subclass ?? "").toLowerCase()];
  if ( sub ) return sub.progression;
  return CLASSES[classKey]?.progression ?? "none";
}

function parseList(text) {
  if ( !text ) return [];
  const out = [];
  for ( const part of text.split(/,\s*|\n|;\s*/) ) {
    const p = part.trim().replace(/^[-*•]\s*/, "");
    if ( !p ) continue;
    const m = p.match(/^(.*?)(?:\s*[x×]\s*(\d+)|\s*\((\d+)\))?\s*(?:\(([^)]*)\))?$/i);
    const quantity = m?.[2] ? Number(m[2]) : m?.[3] ? Number(m[3]) : 1;
    out.push({ name: (m?.[1] ?? p).trim(), quantity, note: m?.[4] ?? null });
  }
  return out;
}

function placeholder(name, hint, quantity, note, featType) {
  const item = createItem({ itemType: hint === "spell" ? "spell" : hint === "feat" ? "feat" : "loot", name, quantity });
  item.placeholder = { lookup: name, hint, note };
  if ( featType ) item.featType = { value: featType, subtype: "" };
  if ( hint === "spell" ) item.spell = { level: null, school: "", method: "spell", prepared: 1 };
  item.confidence = 0.5;
  return item;
}

export { parseNumberWord, parseFeet, parseAverageAndFormula, ALIGNMENT_LOOKUP };
