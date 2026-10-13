import { ABILITIES, CONDITIONS, DAMAGE_TYPES, SKILLS } from "../core/dnd5e-reference.js";

/**
 * Shared text helpers for the natural-language parsers.
 */

export const NUMBER_WORDS = Object.freeze({
  zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100
});

export const ORDINAL_WORDS = Object.freeze({
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8, "9th": 9, "10th": 10, "20th": 20
});

/** Full ability name → key (plus abbreviations). */
export const ABILITY_LOOKUP = Object.freeze({
  ...Object.fromEntries(Object.entries(ABILITIES).map(([k, v]) => [v, k])),
  ...Object.fromEntries(Object.keys(ABILITIES).map(k => [k, k]))
});

export const SKILL_LOOKUP = Object.freeze(Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [v.label.toLowerCase(), k])));

export const DAMAGE_TYPE_RE = new RegExp(`\\b(${DAMAGE_TYPES.join("|")})\\b`, "i");
export const CONDITION_RE = new RegExp(`\\b(${CONDITIONS.join("|")})\\b`, "i");

/**
 * Normalize whitespace, quotes, dashes and ligatures from PDF/web copies.
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[–—−]/g, "-")
    .replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
    .replace(/…/g, "...")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Convert a number word or numeral string to a number; returns null when unknown. */
export function parseNumberWord(word) {
  if ( word === null || word === undefined ) return null;
  const s = String(word).trim().toLowerCase();
  if ( /^-?\d+(\.\d+)?$/.test(s) ) return Number(s);
  if ( s in NUMBER_WORDS ) return NUMBER_WORDS[s];
  if ( s in ORDINAL_WORDS ) return ORDINAL_WORDS[s];
  return null;
}

/** Parse "1/2", "1/4", "1/8", "0", "17" challenge ratings. */
export function parseCR(text) {
  const s = String(text ?? "").trim();
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)/);
  if ( frac ) return Number(frac[1]) / Number(frac[2]);
  const n = s.match(/^\d+(\.\d+)?/);
  return n ? Number(n[0]) : null;
}

/** Parse a signed modifier like "+4" or "-1" or "−1". */
export function parseSigned(text) {
  const m = String(text ?? "").replace(/[−–]/g, "-").match(/([+-])\s*(\d+)/);
  if ( !m ) return null;
  return (m[1] === "-" ? -1 : 1) * Number(m[2]);
}

/**
 * Parse "5 (1d6 + 2)" or "1d6 + 2" or "7" into { average, formula }.
 * @param {string} text
 * @returns {{average: number|null, formula: string}|null}
 */
export function parseAverageAndFormula(text) {
  const s = String(text ?? "").replace(/[−–]/g, "-").trim();
  let m = s.match(/^(\d+)\s*\(\s*([^)]+?)\s*\)/);
  if ( m ) return { average: Number(m[1]), formula: cleanDice(m[2]) };
  m = s.match(/^(\d*d\d+(?:\s*[+-]\s*\d+)?)/i);
  if ( m ) return { average: null, formula: cleanDice(m[1]) };
  m = s.match(/^(\d+)\b/);
  if ( m ) return { average: Number(m[1]), formula: m[1] };
  return null;
}

/** Normalize dice text spacing: "1d6+2" → "1d6 + 2". */
export function cleanDice(text) {
  return String(text ?? "").replace(/[−–]/g, "-").replace(/\s+/g, "").replace(/([+-])/g, " $1 ").trim();
}

/** Find all dice expressions with optional damage types in a sentence. */
export function findDamageExpressions(text) {
  const results = [];
  const re = /(?:(\d+)\s*\()?(\d*d\d+(?:\s*[+-]\s*\d+)?)\)?\s*(?:(\w+)\s+)?damage/gi;
  let m;
  while ( (m = re.exec(String(text ?? "").replace(/[−–]/g, "-"))) ) {
    const type = m[3] && DAMAGE_TYPES.includes(m[3].toLowerCase()) ? m[3].toLowerCase() : null;
    results.push({ average: m[1] ? Number(m[1]) : null, formula: cleanDice(m[2]), type, index: m.index, text: m[0] });
  }
  return results;
}

/** Detect a damage type word. */
export function findDamageType(text) {
  const m = String(text ?? "").match(DAMAGE_TYPE_RE);
  return m ? m[1].toLowerCase() : null;
}

/** Detect all damage types in text (ordered, unique). */
export function findDamageTypes(text) {
  const out = [];
  const re = new RegExp(DAMAGE_TYPE_RE.source, "gi");
  let m;
  while ( (m = re.exec(String(text ?? ""))) ) { const t = m[1].toLowerCase(); if ( !out.includes(t) ) out.push(t); }
  return out;
}

/** Detect a condition word. */
export function findCondition(text) {
  const m = String(text ?? "").match(CONDITION_RE);
  return m ? m[1].toLowerCase() : null;
}

/** Ability key from a word like "Dexterity" or "DEX". */
export function abilityKey(word) {
  if ( !word ) return null;
  return ABILITY_LOOKUP[String(word).trim().toLowerCase()] ?? null;
}

/** Skill key from a label like "Perception". */
export function skillKey(word) {
  if ( !word ) return null;
  return SKILL_LOOKUP[String(word).trim().toLowerCase()] ?? null;
}

/**
 * Split text into sentences, keeping abbreviations like "ft." and "DC 15." intact where possible.
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if ( !s ) return [];
  const protectedText = s.replace(/\b(ft|in|vs|e\.g|i\.e|St|Mr|Dr|No)\./gi, "$1<DOT>");
  return protectedText.split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/).map(p => p.replace(/<DOT>/g, ".").trim()).filter(Boolean);
}

/** Convert a word count ("one", "two", "1") into a number, or null. */
export function parseCount(word) { return parseNumberWord(word); }

/** Build a URL-safe identifier (mirrors dnd5e's slugify used for identifiers). */
export function slugify(text) {
  return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Escape HTML special characters. */
export function escapeHTML(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

/** Wrap plain paragraphs in <p> tags. */
export function paragraphsToHTML(text) {
  return String(text ?? "").split(/\n{2,}|\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHTML(p)}</p>`).join("");
}

/** Title-case a name. */
export function titleCase(text) {
  return String(text ?? "").toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase());
}

/**
 * A non-cryptographic content fingerprint (FNV-1a 32-bit, hex) for duplicate detection.
 * @param {string} text
 * @returns {string}
 */
export function fingerprint(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? "");
  for ( let i = 0; i < s.length; i++ ) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Parse distance like "60 ft." or "30 feet" → number of feet, or null. */
export function parseFeet(text) {
  const m = String(text ?? "").match(/(\d+)\s*(?:ft\.?|feet|foot|')/i);
  return m ? Number(m[1]) : null;
}

/** Parse a duration phrase into { value, units } using dnd5e units; null when unknown. */
export function parseDurationPhrase(text) {
  const s = String(text ?? "").toLowerCase().replace(/[−–]/g, "-");
  if ( /instantaneous/.test(s) ) return { value: "", units: "inst" };
  if ( /until dispelled or triggered/.test(s) ) return { value: "", units: "dstr" };
  if ( /until dispelled/.test(s) ) return { value: "", units: "disp" };
  if ( /permanent/.test(s) ) return { value: "", units: "perm" };
  let m = s.match(/(\d+|[a-z]+)\s*(round|turn|second|minute|hour|day|week|month|year)s?\b/);
  if ( m ) {
    const n = parseNumberWord(m[1]);
    if ( n !== null ) return { value: String(n), units: m[2] };
  }
  if ( /until the (end|start) of (its|your|the target's|the creature's) next turn/.test(s) ) {
    m = s.match(/until the (end|start) of/);
    return { value: "1", units: "turn", expiry: m[1] === "end" ? "turnEnd" : "turnStart" };
  }
  if ( /special/.test(s) ) return { value: "", units: "spec" };
  return null;
}
