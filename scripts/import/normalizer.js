import { fingerprint, slugify } from "./text-utils.js";
import { validateEntry } from "./schema.js";

/**
 * Normalization: final shaping of IR entries after parsing and interpretation.
 *  - identifiers (slugs) and content fingerprints for duplicate detection
 *  - validation results attached to each entry
 *  - mechanics that are not enabled are kept but flagged
 */
export function normalizeEntry(entry) {
  if ( !entry ) return entry;
  entry.identifier ??= slugify(entry.name);
  entry.fingerprint = fingerprint(stableString(entry));
  const v = validateEntry(entry);
  entry.validation = { errors: v.errors, warnings: v.warnings, valid: v.errors.length === 0 };
  if ( entry.kind === "actor" ) {
    for ( const item of entry.items ?? [] ) {
      item.identifier ??= slugify(item.name);
      item.fingerprint = fingerprint(stableString(item));
    }
  }
  for ( const m of entry.mechanics ?? [] ) {
    if ( m.category === "unresolved" ) m.enabled = false;
  }
  for ( const item of entry.items ?? [] ) for ( const m of item.mechanics ?? [] ) if ( m.category === "unresolved" ) m.enabled = false;
  return entry;
}

/** Deterministic string of the content that matters for identity (not ids, not confidence). */
export function stableString(entry) {
  const strip = (obj) => {
    if ( Array.isArray(obj) ) return obj.map(strip);
    if ( obj && typeof obj === "object" ) {
      const out = {};
      for ( const key of Object.keys(obj).sort() ) {
        if ( ["id", "irVersion", "confidence", "warnings", "validation", "fingerprint", "source", "parsed", "mechanics", "sourceText"].includes(key) ) continue;
        out[key] = strip(obj[key]);
      }
      return out;
    }
    return obj;
  };
  return JSON.stringify(strip(entry));
}
