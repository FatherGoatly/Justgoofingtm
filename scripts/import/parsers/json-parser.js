import { createActor, createItem, validateEntry } from "../schema.js";
import { ACTOR_TYPES, ITEM_TYPES } from "../../core/dnd5e-reference.js";
import { LIMITS } from "../../core/constants.js";

/**
 * Parser for the module's documented JSON schema (see docs/supported-formats.md):
 *
 * {
 *   "$schema": "stat-block-importer/v1",
 *   "entries": [ { "kind": "actor", "actorType": "npc", "name": "...", ... }, { "kind": "item", ... } ]
 * }
 *
 * A single entry object (without the envelope) is also accepted. Field names mirror the IR.
 */

export const JSON_SCHEMA_ID = "stat-block-importer/v1";

/**
 * Safe JSON parse with depth and size limits.
 * @param {string} text
 * @returns {*}
 */
export function safeParseJSON(text) {
  if ( typeof text !== "string" ) throw new Error("JSON input must be a string");
  if ( text.length > LIMITS.MAX_FILE_BYTES ) throw new Error("JSON input is too large");
  let depth = 0, max = 0, inString = false, escaped = false;
  for ( const ch of text ) {
    if ( inString ) { if ( escaped ) escaped = false; else if ( ch === "\\" ) escaped = true; else if ( ch === "\"" ) inString = false; continue; }
    if ( ch === "\"" ) inString = true;
    else if ( ch === "{" || ch === "[" ) { depth++; if ( depth > max ) max = depth; }
    else if ( ch === "}" || ch === "]" ) depth--;
    if ( max > LIMITS.MAX_JSON_DEPTH ) throw new Error(`JSON nesting exceeds ${LIMITS.MAX_JSON_DEPTH} levels`);
  }
  const parsed = JSON.parse(text, (key, value) => (key === "__proto__" || key === "constructor" || key === "prototype") ? undefined : value);
  return parsed;
}

/** Does this parsed JSON look like the module schema? */
export function isModuleSchema(data) {
  if ( !data || typeof data !== "object" ) return false;
  if ( data.$schema === JSON_SCHEMA_ID ) return true;
  if ( Array.isArray(data.entries) && data.entries.every(e => e?.kind === "actor" || e?.kind === "item") ) return true;
  if ( (data.kind === "actor" || data.kind === "item") && data.name ) return true;
  return false;
}

/**
 * Convert parsed schema JSON into IR entries.
 * @param {object} data
 * @returns {{entries: object[], warnings: string[]}}
 */
export function parseSchemaJSON(data) {
  const warnings = [];
  const raw = Array.isArray(data?.entries) ? data.entries : [data];
  const entries = [];
  for ( const [i, e] of raw.entries() ) {
    if ( !e || typeof e !== "object" ) { warnings.push(`Entry ${i} is not an object`); continue; }
    let entry;
    if ( e.kind === "actor" ) {
      if ( e.actorType && !ACTOR_TYPES.includes(e.actorType) ) { warnings.push(`Entry ${i}: unknown actorType ${e.actorType}`); continue; }
      entry = createActor({ ...e, source: { format: "json-schema", text: JSON.stringify(e) }, items: (e.items ?? []).map(normalizeItemInput) });
    } else if ( e.kind === "item" ) {
      if ( e.itemType && !ITEM_TYPES.includes(e.itemType) ) { warnings.push(`Entry ${i}: unknown itemType ${e.itemType}`); continue; }
      entry = createItem({ ...normalizeItemInput(e), source: { format: "json-schema", text: JSON.stringify(e) } });
    } else { warnings.push(`Entry ${i}: kind must be "actor" or "item"`); continue; }
    const v = validateEntry(entry);
    if ( v.errors.length ) { warnings.push(`Entry ${i} (${entry.name}): ${v.errors.join("; ")}`); entry.warnings.push(...v.errors); }
    entries.push(entry);
  }
  return { entries, warnings };
}

function normalizeItemInput(e) {
  const out = { ...e };
  if ( typeof out.description === "string" ) out.description = { original: out.description };
  if ( out.damage && !out.weapon && out.itemType === "weapon" ) out.weapon = { damage: typeof out.damage === "string" ? { formula: out.damage, type: out.damageType ?? "" } : out.damage };
  return out;
}
