import { FLAG_SCOPE, FLAGS } from "../core/constants.js";

/**
 * Duplicate detection. A candidate document is a duplicate of an existing document when:
 *  1. the existing document carries the same import fingerprint (exact re-import), or
 *  2. the existing document was imported from the same source id, or
 *  3. the name and document type match (reported as "similar"; never auto-overwritten).
 *
 * @param {object} data        Built document data (has name, type, flags).
 * @param {Iterable<object>} collection  Existing documents (Foundry documents or plain data).
 * @returns {{matches: object[], exact: object|null}}
 */
export function findDuplicates(data, collection) {
  const matches = [];
  const fp = data.flags?.[FLAG_SCOPE]?.[FLAGS.IMPORT]?.fingerprint ?? null;
  const sourceId = data.flags?.[FLAG_SCOPE]?.[FLAGS.IMPORT]?.sourceId ?? null;
  for ( const doc of collection ?? [] ) {
    if ( !doc ) continue;
    const flags = doc.flags?.[FLAG_SCOPE]?.[FLAGS.IMPORT] ?? doc.getFlag?.(FLAG_SCOPE, FLAGS.IMPORT) ?? null;
    const type = doc.type;
    if ( fp && flags?.fingerprint === fp ) { matches.push({ doc, reason: "fingerprint", exact: true }); continue; }
    if ( sourceId && flags?.sourceId === sourceId ) { matches.push({ doc, reason: "sourceId", exact: false }); continue; }
    if ( type === data.type && normalize(doc.name) === normalize(data.name) ) matches.push({ doc, reason: "name", exact: false });
  }
  return { matches, exact: matches.find(m => m.exact)?.doc ?? null };
}

function normalize(name) { return String(name ?? "").trim().toLowerCase(); }

/**
 * Compute a merge update for an existing document: keeps user-editable fields the user may have
 * changed (name, img, description prose if edited, ownership, folder) and updates the mechanical
 * system data, activities, effects and module flags.
 * @param {object} existing  Existing document (data or document).
 * @param {object} data      New data.
 * @returns {object} update data
 */
export function mergeUpdate(existing, data) {
  const update = { _id: existing.id ?? existing._id, system: data.system, flags: { [FLAG_SCOPE]: data.flags?.[FLAG_SCOPE] } };
  const existingDesc = existing.system?.description?.value ?? "";
  const importedDesc = existing.flags?.[FLAG_SCOPE]?.[FLAGS.IMPORT]?.descriptionHash ?? existing.getFlag?.(FLAG_SCOPE, FLAGS.IMPORT)?.descriptionHash;
  // Keep the user's edited description when it no longer matches what we originally imported.
  if ( importedDesc && importedDesc !== hash(existingDesc) ) update.system = { ...update.system, description: existing.system.description };
  if ( data.effects ) update.effects = data.effects;
  return update;
}

export function hash(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? "");
  for ( let i = 0; i < s.length; i++ ) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
