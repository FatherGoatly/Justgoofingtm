import { createActor, createItem, createActivity, createUses } from "../schema.js";
import {
  abilityKey, findDamageTypes, normalizeText, parseCR, parseSigned, parseAverageAndFormula, parseNumberWord,
  skillKey, titleCase
} from "../text-utils.js";
import { parseFeature } from "./action-parser.js";
import {
  ACTOR_SIZES, CONDITIONS, CR_TABLE, CREATURE_TYPES, DAMAGE_TYPES, languageKeys, ARMOR_NAME_ALIASES
} from "../../core/dnd5e-reference.js";

/**
 * Parser for creature / NPC stat blocks in plain text (Monster Manual 2014 and 2024 layouts, and the
 * common web/PDF copy variants).
 */

const SECTION_HEADERS = [
  ["traits", /^traits$/i],
  ["action", /^actions$/i],
  ["bonus", /^bonus actions$/i],
  ["reaction", /^reactions$/i],
  ["legendary", /^legendary actions$/i],
  ["mythic", /^mythic actions$/i],
  ["lair", /^lair actions$/i],
  ["regional", /^regional effects$/i],
  ["villain", /^villain actions$/i],
  ["description", /^(description|lore)$/i]
];

const STAT_LINE_RE = /^(Armor Class|AC|Hit Points|HP|Speed|Initiative|Saving Throws|Skills|Damage Vulnerabilities|Damage Resistances|Damage Immunities|Condition Immunities|Vulnerabilities|Resistances|Immunities|Senses|Languages|Challenge|CR|Proficiency Bonus|Gear)\b\s*:?\s*(.*)$/i;

const SIZE_WORDS = Object.fromEntries(Object.entries(ACTOR_SIZES).map(([k, v]) => [v, k]));

/**
 * Quick check whether text looks like a creature stat block.
 * @param {string} text
 * @returns {number} score 0..1
 */
export function scoreStatBlock(text) {
  const t = normalizeText(text);
  let score = 0;
  if ( /^\s*(Armor Class|AC)\b/mi.test(t) ) score += 0.3;
  if ( /^\s*(Hit Points|HP)\b/mi.test(t) ) score += 0.3;
  if ( /\b(STR|DEX|CON|INT|WIS|CHA)\b/.test(t) ) score += 0.2;
  if ( /^\s*(Challenge|CR)\b/mi.test(t) ) score += 0.1;
  if ( /^\s*Actions\s*$/mi.test(t) ) score += 0.1;
  return Math.min(1, score);
}

/**
 * Split text into multiple stat blocks when several creatures are pasted together. A new block
 * starts at a name line immediately followed by a size/type line.
 * @param {string} text
 * @returns {string[]}
 */
export function splitStatBlocks(text) {
  const lines = normalizeText(text).split("\n");
  const starts = [];
  for ( let i = 0; i < lines.length - 1; i++ ) {
    if ( isTypeLine(lines[i + 1]) && lines[i].trim() && !STAT_LINE_RE.test(lines[i]) && !isTypeLine(lines[i]) ) starts.push(i);
  }
  if ( starts.length <= 1 ) return [lines.join("\n")];
  const blocks = [];
  for ( let i = 0; i < starts.length; i++ ) {
    blocks.push(lines.slice(starts[i], starts[i + 1] ?? lines.length).join("\n").trim());
  }
  return blocks.filter(Boolean);
}

function isTypeLine(line) {
  const l = String(line ?? "").trim().toLowerCase();
  return /^(tiny|small|medium|large|huge|gargantuan)\b/.test(l) && /(aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead|swarm)/.test(l);
}

/**
 * Parse one creature stat block.
 * @param {string} text
 * @param {object} [options]
 * @returns {object} Actor IR
 */
export function parseStatBlock(text, options={}) {
  const warnings = [];
  const raw = normalizeText(text);
  const lines = raw.split("\n").map(l => l.trim()).filter(l => l.length);
  if ( !lines.length ) throw new Error("Empty stat block");

  // Name: first line (strip trailing CR or size info sometimes appended)
  let name = lines[0].replace(/\s+\((?:CR|Challenge)[^)]*\)\s*$/i, "").trim();
  name = name.replace(/\*+/g, "").trim();
  let idx = 1;
  const actor = createActor({ name: titleCase(name) === name.toUpperCase() ? titleCase(name) : name, source: { format: "text", text: raw } });

  // Type line
  if ( idx < lines.length && isTypeLine(lines[idx]) ) {
    parseTypeLine(lines[idx], actor, warnings);
    idx += 1;
  } else {
    warnings.push("No size/type line found after the name.");
  }

  // Stat lines until the ability table or first section
  const abilityIdx = findAbilityTable(lines, idx);
  const headerLines = [];
  const bodyStart = { value: null };
  for ( let i = idx; i < lines.length; i++ ) {
    if ( abilityIdx.start !== null && i >= abilityIdx.start && i <= abilityIdx.end ) continue;
    if ( STAT_LINE_RE.test(lines[i]) ) headerLines.push(lines[i]);
    else if ( abilityIdx.end !== null && i > abilityIdx.end ) { bodyStart.value = i; break; }
    else if ( abilityIdx.start === null && i > idx + 12 ) { bodyStart.value = i; break; }
  }
  // Allow stat lines that continue after the ability table (2024 layout puts Skills etc. after the table)
  if ( bodyStart.value === null ) bodyStart.value = abilityIdx.end !== null ? abilityIdx.end + 1 : idx;
  let bodyIdx = bodyStart.value;
  while ( bodyIdx < lines.length && STAT_LINE_RE.test(lines[bodyIdx]) ) { headerLines.push(lines[bodyIdx]); bodyIdx += 1; }

  for ( const line of headerLines ) parseStatLine(line, actor, warnings);
  if ( abilityIdx.start !== null ) parseAbilityTable(lines.slice(abilityIdx.start, abilityIdx.end + 1), actor, warnings);
  else warnings.push("Ability score table not found; abilities default to 10.");

  // Derived proficiency / xp
  if ( actor.cr !== null && actor.cr !== undefined ) {
    const row = CR_TABLE[actor.cr];
    if ( row ) {
      actor.proficiencyBonus ??= row.prof;
      actor.xp ??= row.xp;
    }
  }

  // Body: sections of features
  const body = lines.slice(bodyIdx);
  const sections = splitSections(body);
  const context = { abilities: actor.abilities, proficiency: actor.proficiencyBonus };
  const items = [];
  for ( const section of sections ) {
    if ( section.kind === "description" ) { actor.biography = section.text; continue; }
    if ( section.kind === "legendary" ) {
      const intro = section.intro ?? "";
      const m = intro.match(/can take (\d+|[a-z]+) legendary actions?/i) ?? intro.match(/Legendary Action Uses:\s*(\d+)/i);
      if ( m ) actor.legendary.actions = parseNumberWord(m[1]) ?? 3;
      actor.legendary.description = intro;
    }
    if ( section.kind === "lair" ) { actor.lair.value = true; actor.lair.description = section.intro ?? ""; const im = (section.intro ?? "").match(/initiative count (\d+)/i); if ( im ) actor.lair.initiative = Number(im[1]); }
    if ( section.kind === "regional" ) { actor.regionalEffects = [section.intro, ...section.features.map(f => `${f.name}. ${f.text}`)].filter(Boolean).join("\n\n"); continue; }
    for ( const feature of section.features ) {
      if ( /^legendary resistance/i.test(feature.name) ) {
        const m = feature.name.match(/\((\d+)\/day/i) ?? feature.name.match(/\((\d+)\/Day/i);
        actor.legendary.resistances = m ? Number(m[1]) : 3;
        const lm = feature.name.match(/(\d+)\/Day, or (\d+)\/Day in Lair/i);
        if ( lm ) actor.legendary.resistances = Number(lm[1]);
        items.push(buildLegendaryResistance(feature, actor.legendary.resistances));
        continue;
      }
      if ( /^(innate )?spellcasting/i.test(feature.name) || /^spellcasting \(/i.test(feature.name) ) {
        const sc = parseSpellcasting(feature, actor, warnings);
        if ( sc ) { actor.spellcasting = mergeSpellcasting(actor.spellcasting, sc); items.push(sc.feature); continue; }
      }
      const kind = section.kind === "traits" ? "trait" : section.kind;
      const item = parseFeature({ name: feature.name, text: feature.text, section: kind, context });
      items.push(item);
    }
  }
  actor.items = items;
  actor.warnings = warnings;
  actor.confidence = computeConfidence(actor, warnings);
  if ( options.includeRaw !== false ) actor.source.text = raw;
  return actor;
}

/* -------------------------------------------- */

function parseTypeLine(line, actor, warnings) {
  const l = line.trim();
  const m = l.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?:\s+or\s+(Tiny|Small|Medium|Large|Huge|Gargantuan))?\s+(swarm of (\w+) )?([A-Za-z]+)(?:\s*\(([^)]+)\))?\s*,?\s*(.*)$/i);
  if ( !m ) { warnings.push(`Could not fully parse type line "${l}"`); return; }
  actor.size = SIZE_WORDS[m[1].toLowerCase()] ?? "med";
  const typeWord = m[5].toLowerCase();
  if ( m[3] ) {
    actor.creatureType.swarm = SIZE_WORDS[(m[4] ?? "").toLowerCase().replace(/s$/, "")] ?? "tiny";
  }
  if ( CREATURE_TYPES.includes(typeWord) ) actor.creatureType.value = typeWord;
  else if ( CREATURE_TYPES.includes(typeWord.replace(/s$/, "")) ) actor.creatureType.value = typeWord.replace(/s$/, "");
  else { actor.creatureType.value = ""; actor.creatureType.custom = m[5]; }
  if ( m[6] ) actor.creatureType.subtype = m[6].trim();
  const alignment = (m[7] ?? "").replace(/\.$/, "").trim();
  actor.alignment = alignment ? titleCase(alignment) : "";
}

function findAbilityTable(lines, from) {
  for ( let i = from; i < lines.length; i++ ) {
    const l = lines[i];
    // 2014 header row: "STR DEX CON INT WIS CHA"
    if ( /^STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA$/i.test(l) ) {
      // next line(s) contain the values
      let end = i + 1;
      while ( end < lines.length && end < i + 7 && /\d+\s*\([+-]?\d+\)/.test(lines[end]) ) end += 1;
      return { start: i, end: Math.max(i + 1, end - 1), style: "2014" };
    }
    // 2024 style rows: "STR 27 +8 +8" possibly with "MOD SAVE" header before
    if ( /^(STR|Str)\s+\d+\s+[+-]\d+\s+[+-]\d+/.test(l) ) {
      let end = i;
      while ( end + 1 < lines.length && /^(STR|DEX|CON|INT|WIS|CHA)\s+\d+\s+[+-]\d+\s+[+-]\d+/i.test(lines[end + 1]) ) end += 1;
      return { start: i, end, style: "2024" };
    }
    // Inline single-line: "STR 8 (-1) DEX 14 (+2) ..."
    if ( /STR\s*\d+\s*\([+-]?\d+\)/i.test(l) && /CHA\s*\d+\s*\([+-]?\d+\)/i.test(l) ) return { start: i, end: i, style: "inline" };
    // Compact single stat per line "STR 8 (-1)"
    if ( /^STR\s+\d+\s*\(/i.test(l) ) {
      let end = i;
      while ( end + 1 < lines.length && /^(DEX|CON|INT|WIS|CHA)\s+\d+\s*\(/i.test(lines[end + 1]) ) end += 1;
      return { start: i, end, style: "stacked" };
    }
  }
  return { start: null, end: null };
}

function parseAbilityTable(tableLines, actor, warnings) {
  const keys = ["str", "dex", "con", "int", "wis", "cha"];
  const joined = tableLines.join(" ");
  // 2024 rows
  const rows = tableLines.filter(l => /^(STR|DEX|CON|INT|WIS|CHA)\s+\d+\s+[+-]\d+\s+[+-]\d+/i.test(l));
  if ( rows.length >= 6 ) {
    for ( const row of rows ) {
      const m = row.match(/^(STR|DEX|CON|INT|WIS|CHA)\s+(\d+)\s+([+-]\d+)\s+([+-]\d+)/i);
      const key = m[1].toLowerCase();
      const value = Number(m[2]);
      const mod = Number(m[3]);
      const save = Number(m[4]);
      actor.abilities[key].value = value;
      if ( save !== mod ) {
        actor.abilities[key].proficient = 1;
        actor.abilities[key].saveBonus = save;
      }
    }
    return;
  }
  // inline / 2014 / stacked: collect "N (+M)" pairs in order, optionally prefixed by names
  const named = [...joined.matchAll(/\b(STR|DEX|CON|INT|WIS|CHA)\s*(\d+)\s*\(([+-]?\d+)\)/gi)];
  if ( named.length >= 6 ) {
    for ( const m of named ) actor.abilities[m[1].toLowerCase()].value = Number(m[2]);
    return;
  }
  const pairs = [...joined.replace(/^STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA/i, "").matchAll(/(\d+)\s*\(([+-]?\d+)\)/g)];
  if ( pairs.length >= 6 ) {
    keys.forEach((k, i) => actor.abilities[k].value = Number(pairs[i][1]));
    return;
  }
  warnings.push("Could not parse ability scores; defaults used.");
}

function parseStatLine(line, actor, warnings) {
  const m = line.match(STAT_LINE_RE);
  if ( !m ) return;
  const label = m[1].toLowerCase();
  const value = m[2].trim();
  switch ( label ) {
    case "armor class": case "ac": {
      const n = value.match(/(\d+)/);
      actor.ac.value = n ? Number(n[1]) : null;
      const desc = value.match(/\(([^)]+)\)/);
      actor.ac.description = desc ? desc[1] : "";
      actor.ac.calc = inferACCalc(actor.ac.description);
      const init = value.match(/Initiative\s*([+-]\d+)/i);
      if ( init ) actor.initiative = parseSigned(init[1]);
      break;
    }
    case "hit points": case "hp": {
      const parsed = parseAverageAndFormula(value);
      if ( parsed ) {
        actor.hp.max = parsed.average ?? null;
        actor.hp.value = parsed.average ?? null;
        actor.hp.formula = parsed.formula ?? "";
        if ( parsed.average === null && /^\d+$/.test(parsed.formula) ) { actor.hp.max = Number(parsed.formula); actor.hp.value = actor.hp.max; }
      } else warnings.push(`Could not parse hit points "${value}"`);
      break;
    }
    case "speed": {
      const parts = value.split(/,\s*/);
      for ( const part of parts ) {
        const p = part.trim();
        const fly = p.match(/^fly\s+(\d+)\s*ft\.?(\s*\(hover\))?/i);
        if ( fly ) { actor.movement.fly = Number(fly[1]); if ( fly[2] ) actor.movement.hover = true; continue; }
        const other = p.match(/^(burrow|climb|swim|jump)\s+(\d+)\s*ft/i);
        if ( other ) { actor.movement[other[1].toLowerCase()] = Number(other[2]); continue; }
        const walk = p.match(/^(\d+)\s*ft/i);
        if ( walk ) { actor.movement.walk = Number(walk[1]); continue; }
        if ( /hover/i.test(p) ) { actor.movement.hover = true; continue; }
        if ( p ) actor.movement.special = [actor.movement.special, p].filter(Boolean).join(", ");
      }
      break;
    }
    case "initiative": {
      const s = parseSigned(value);
      if ( s !== null ) actor.initiative = s;
      break;
    }
    case "saving throws": {
      for ( const part of value.split(/,\s*/) ) {
        const sm = part.match(/^(Str|Dex|Con|Int|Wis|Cha)\w*\s*([+-]\s*\d+)/i);
        if ( !sm ) continue;
        const key = abilityKey(sm[1].toLowerCase().slice(0, 3));
        if ( key ) { actor.abilities[key].proficient = 1; actor.abilities[key].saveBonus = parseSigned(sm[2]); }
      }
      break;
    }
    case "skills": {
      for ( const part of value.split(/,\s*/) ) {
        const sm = part.match(/^([A-Za-z ]+?)\s*([+-]\s*\d+)/);
        if ( !sm ) continue;
        const key = skillKey(sm[1]);
        if ( key ) actor.skills[key] = { bonus: parseSigned(sm[2]) };
        else warnings.push(`Unknown skill "${sm[1]}"`);
      }
      break;
    }
    case "damage vulnerabilities": case "vulnerabilities": parseDamageTraits(value, actor, "dv"); break;
    case "damage resistances": case "resistances": parseDamageTraits(value, actor, "dr"); break;
    case "damage immunities": parseDamageTraits(value, actor, "di"); break;
    case "immunities": {
      // 2024 combines damage and condition immunities on one line
      parseDamageTraits(value, actor, "di");
      parseConditionImmunities(value, actor);
      break;
    }
    case "condition immunities": parseConditionImmunities(value, actor); break;
    case "senses": {
      for ( const part of value.split(/[,;]\s*/) ) {
        const sm = part.match(/^(blindsight|darkvision|tremorsense|truesight)\s+(\d+)\s*ft/i);
        if ( sm ) { actor.senses[sm[1].toLowerCase()] = Number(sm[2]); if ( /blind beyond/i.test(part) ) actor.senses.special = "Blind beyond this radius"; continue; }
        const pp = part.match(/passive Perception\s+(\d+)/i);
        if ( pp ) { actor.senses.passivePerception = Number(pp[1]); continue; }
        if ( part.trim() ) actor.senses.special = [actor.senses.special, part.trim()].filter(Boolean).join(", ");
      }
      break;
    }
    case "languages": parseLanguages(value, actor); break;
    case "challenge": case "cr": {
      actor.cr = parseCR(value);
      const xp = value.match(/\(([\d,]+)\s*XP/i);
      if ( xp ) actor.xp = Number(xp[1].replace(/,/g, ""));
      const pb = value.match(/PB\s*\+?(\d+)/i);
      if ( pb ) actor.proficiencyBonus = Number(pb[1]);
      break;
    }
    case "proficiency bonus": {
      const n = value.match(/\+?(\d+)/);
      if ( n ) actor.proficiencyBonus = Number(n[1]);
      break;
    }
    case "gear": {
      actor.gear = value.split(/,\s*/).map(s => s.trim()).filter(Boolean);
      break;
    }
  }
}

function inferACCalc(description) {
  const d = String(description ?? "").toLowerCase();
  if ( !d ) return "";
  if ( /natural armor/.test(d) ) return "natural";
  if ( /mage armor/.test(d) ) return "mage";
  if ( /unarmored defense/.test(d) ) return "";
  if ( Object.keys(ARMOR_NAME_ALIASES).some(k => d.includes(k)) || /armor|shield|plate|mail|leather/.test(d) ) return "armored";
  return "";
}

function parseDamageTraits(value, actor, key) {
  const text = value.toLowerCase();
  // Handle "bludgeoning, piercing, and slashing from nonmagical attacks"
  const segments = text.split(/;\s*/);
  const types = [];
  const custom = [];
  const bypasses = new Set();
  for ( const seg of segments ) {
    const found = findDamageTypes(seg);
    if ( /nonmagical/.test(seg) ) {
      bypasses.add("mgc");
      if ( /silver/.test(seg) ) bypasses.add("sil");
      if ( /adamantine/.test(seg) ) bypasses.add("ada");
      for ( const t of found ) if ( !types.includes(t) ) types.push(t);
      continue;
    }
    if ( found.length ) { for ( const t of found ) if ( !types.includes(t) ) types.push(t); }
    else if ( seg.trim() && !CONDITIONS.some(c => seg.includes(c)) ) custom.push(seg.trim());
  }
  actor.traits[key] = types.filter(t => DAMAGE_TYPES.includes(t));
  actor.traits[`${key}Custom`] = custom.join("; ");
  actor.traits[`${key}Bypasses`] = [...bypasses];
}

function parseConditionImmunities(value, actor) {
  const text = value.toLowerCase();
  const found = [];
  for ( const c of CONDITIONS ) {
    if ( new RegExp(`\\b${c}\\b`).test(text) ) found.push(c);
  }
  if ( /\bexhausted\b/.test(text) && !found.includes("exhaustion") ) found.push("exhaustion");
  if ( found.length ) actor.traits.ci = found;
}

function parseLanguages(value, actor) {
  const keys = languageKeys();
  const labelToKey = new Map([...keys.entries()].map(([k, v]) => [v, k]));
  const values = [];
  const custom = [];
  for ( let part of value.split(/[,;]\s*/) ) {
    part = part.trim().replace(/\.$/, "");
    if ( !part || /^(—|-|none)$/i.test(part) ) continue;
    const low = part.toLowerCase();
    const telepathy = low.match(/telepathy\s+(\d+)\s*ft/);
    if ( telepathy ) { actor.languages.communication = { telepathy: Number(telepathy[1]) }; continue; }
    let key = labelToKey.get(low);
    if ( !key ) {
      // "Common plus one other", "understands Common but can't speak", "Common, Draconic (plus two more)"
      for ( const [label, k] of labelToKey.entries() ) {
        if ( new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(low) ) { key = k; break; }
      }
    }
    if ( key && !/understands|can't speak|cannot speak/.test(low) ) values.push(key);
    else custom.push(part);
  }
  actor.languages.value = [...new Set(values)];
  actor.languages.custom = custom.join("; ");
}

/**
 * Split body lines into sections with features. A feature starts with a line whose first sentence is
 * a bold-ish name: "Name. Text..." or "Name (Recharge 5–6). Text".
 */
function splitSections(lines) {
  const sections = [];
  let current = { kind: "traits", features: [], intro: null, text: "" };
  sections.push(current);
  let currentFeature = null;
  for ( const rawLine of lines ) {
    const line = rawLine.replace(/^\*\*|\*\*$/g, "").trim();
    const header = SECTION_HEADERS.find(([, re]) => re.test(line.replace(/[:.]$/, "")));
    if ( header ) {
      current = { kind: header[0], features: [], intro: null, text: "" };
      sections.push(current);
      currentFeature = null;
      continue;
    }
    const fm = line.match(/^(?:\*\*|__)?([A-Z][A-Za-z'’\-/ ]{1,60}?(?:\s*\([^)]{1,60}\))?)(?:\*\*|__)?[.:]\s+(.*)$/);
    const looksLikeFeature = fm && !/^(Hit|Failure|Success|Trigger|Response|Effect|Melee|Ranged|Melee or Ranged|At Will|Cantrips?|Each|Note|Failure or Success|Legendary Action Uses|Mythic Action Uses|Lair Action Uses)\b/i.test(fm[1]) && !/^\d/.test(fm[1]) && !/\b(saving throw|attack roll|weapon attack|spell attack)\s*$/i.test(fm[1]);
    if ( looksLikeFeature ) {
      currentFeature = { name: fm[1].trim(), text: fm[2].trim() };
      current.features.push(currentFeature);
      continue;
    }
    if ( currentFeature ) currentFeature.text += ` ${line}`;
    else if ( current.kind === "description" ) current.text += (current.text ? "\n" : "") + line;
    else current.intro = [current.intro, line].filter(Boolean).join(" ");
  }
  return sections;
}

function buildLegendaryResistance(feature, max) {
  return createItem({
    itemType: "feat",
    name: "Legendary Resistance",
    description: { original: feature.text },
    featType: { value: "monster", subtype: "" },
    properties: ["trait"],
    activities: [createActivity({
      type: "utility", name: "Expend Use", activation: { type: "special", condition: "fails a saving throw" },
      consumption: [{ type: "attribute", target: "resources.legres.value", value: "1" }], range: { units: "self" }, sourceText: feature.text
    })],
    uses: null
  });
}

/* -------------------------------------------- */
/*  Spellcasting                                */
/* -------------------------------------------- */

const LEVEL_WORDS = { cantrip: 0, cantrips: 0, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8, "9th": 9 };

function parseSpellcasting(feature, actor, warnings) {
  const text = feature.text;
  const sc = { ability: null, dc: null, attack: null, level: null, method: null, spells: [], slots: {}, description: text };
  const ab = text.match(/(?:using|spellcasting ability is)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i);
  if ( ab ) sc.ability = abilityKey(ab[1]);
  const dc = text.match(/spell save DC\s*(\d+)/i);
  if ( dc ) sc.dc = Number(dc[1]);
  const atk = text.match(/([+-]\d+)\s*to hit with spell attacks/i);
  if ( atk ) sc.attack = parseSigned(atk[1]);
  const lvl = text.match(/(\d+)(?:st|nd|rd|th)-level spellcaster/i);
  if ( lvl ) sc.level = Number(lvl[1]);
  sc.innate = /^innate/i.test(feature.name) || /innately/i.test(text);
  const { name: fname, uses } = parseNameSuffixSafe(feature.name);

  // Spell groups: "At Will: a, b", "1/Day Each: c", "2/Day: d", "Cantrips (at will): ...", "1st level (4 slots): ..."
  const groupRe = /(At will|Cantrips?\s*\(at will\)|Cantrips?|(\d+)\s*\/\s*Day(?: Each)?|(\d)(?:st|nd|rd|th)[ -]level\s*\((\d+)\s*slots?\)|(\d)(?:st|nd|rd|th)[ -]level)\s*:\s*([^:]+?)(?=(?:\s(?:At will|Cantrips?|\d+\s*\/\s*Day|\d(?:st|nd|rd|th)[ -]level)\b)|$)/gi;
  let gm;
  const spellNames = new Set();
  while ( (gm = groupRe.exec(text)) ) {
    const label = gm[1].toLowerCase();
    let level = null, usesPerDay = null, method;
    if ( /at will|cantrip/.test(label) ) { method = sc.innate ? "atwill" : "atwill"; level = /cantrip/.test(label) ? 0 : null; }
    else if ( gm[2] ) { usesPerDay = Number(gm[2]); method = "innate"; }
    else if ( gm[3] ) { level = Number(gm[3]); method = "spell"; if ( gm[4] ) sc.slots[level] = Number(gm[4]); }
    else if ( gm[5] ) { level = Number(gm[5]); method = "spell"; }
    const list = gm[6].replace(/\.$/, "").split(/,\s*/).map(s => s.replace(/\*/g, "").trim()).filter(Boolean);
    for ( const spellName of list ) {
      const cleaned = spellName.replace(/\s*\((?:level|lvl)[^)]*\)/i, "").trim();
      const levelOverride = spellName.match(/\((?:level|lvl)\s*(\d+)(?: version)?\)/i);
      if ( !cleaned || spellNames.has(`${cleaned}|${usesPerDay}`) ) continue;
      spellNames.add(`${cleaned}|${usesPerDay}`);
      sc.spells.push({ name: cleaned, level, castLevel: levelOverride ? Number(levelOverride[1]) : null, method, usesPerDay });
    }
  }
  if ( !sc.spells.length ) warnings.push(`Spellcasting feature "${fname}" lists no recognizable spells.`);

  const featureItem = createItem({
    itemType: "feat",
    name: fname,
    description: { original: text },
    featType: { value: "monster", subtype: "" },
    uses,
    activities: [],
    properties: []
  });
  featureItem.section = "trait";
  featureItem.spellcasting = sc;
  sc.feature = featureItem;
  return sc;
}

function parseNameSuffixSafe(name) {
  const m = String(name).match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if ( !m ) return { name, uses: null };
  const inner = m[2].toLowerCase();
  const r = inner.match(/^(\d+)\s*\/\s*day/);
  if ( r ) return { name: m[1].trim(), uses: createUses({ max: Number(r[1]), recovery: [{ period: "day", type: "recoverAll" }] }) };
  return { name: String(name), uses: null };
}

function mergeSpellcasting(existing, incoming) {
  if ( !existing ) return { ability: incoming.ability, dc: incoming.dc, attack: incoming.attack, level: incoming.level, spells: [...incoming.spells], slots: { ...incoming.slots } };
  existing.ability ??= incoming.ability;
  existing.dc ??= incoming.dc;
  existing.attack ??= incoming.attack;
  existing.level ??= incoming.level;
  existing.spells.push(...incoming.spells);
  Object.assign(existing.slots, incoming.slots);
  return existing;
}

function computeConfidence(actor, warnings) {
  let c = 1;
  if ( actor.hp.max === null ) c -= 0.2;
  if ( actor.ac.value === null ) c -= 0.2;
  if ( !actor.creatureType.value && !actor.creatureType.custom ) c -= 0.1;
  c -= Math.min(0.3, warnings.length * 0.05);
  return Math.max(0, Math.round(c * 100) / 100);
}

export { LEVEL_WORDS };
