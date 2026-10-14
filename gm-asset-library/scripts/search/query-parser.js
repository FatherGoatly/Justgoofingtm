/**
 * Search query parser.
 *
 * Syntax (documented in docs/search-syntax.md):
 *   words            every word must match somewhere (name, alias, path, folder, tags, notes, type, source)
 *   "quoted phrase"  must match as a contiguous phrase
 *   -word            must not match
 *   key:value        an operator; value may be quoted. Supported keys are listed in OPERATORS.
 *   key:a,b          several accepted values for one operator (OR)
 * Unknown operators are not silently dropped: they are matched as plain text and reported in `warnings`.
 */

export const OPERATORS = Object.freeze({
  type: { description: "Asset type: image, audio, video, pdf, text, actor, item, scene, journal, playlist, table, cards, macro" },
  source: { description: "Source: file, world, compendium" },
  storage: { description: "File storage: data, public, s3" },
  folder: { description: "Folder path contains this text" },
  ext: { description: "File extension, e.g. webp" },
  tag: { description: "Has this tag" },
  collection: { description: "Member of a collection (name)" },
  pack: { description: "Compendium pack label or id contains this text" },
  role: { description: "Image role: map, token, portrait, tile, effect, handout" },
  map: { description: "Map type: battle, dungeon, city, interior, exterior, regional, unknown" },
  doc: { description: "Foundry document type: Actor, Item, Scene, JournalEntry, Playlist, RollTable, Cards, Macro" },
  favorite: { description: "favorite:true / favorite:false" },
  is: { description: "is:favorite, is:missing, is:unchecked, is:nopreview, is:duplicate, is:tagged, is:untagged, is:animated" },
  width: { description: "Width comparison, e.g. width:>2000" },
  height: { description: "Height comparison, e.g. height:<=512" },
  size: { description: "File size comparison, e.g. size:>5mb" },
  duration: { description: "Duration comparison in seconds or m:ss, e.g. duration:>120" },
  aspect: { description: "landscape, portrait, square, or a ratio like 16:9" },
  in: { description: "Category id: all, images, maps, tokens, portraits, tiles, audio, video, documents, foundry, compendiums" }
});

/**
 * @typedef {object} ParsedQuery
 * @property {Array<{value: string, negate: boolean, phrase: boolean}>} terms
 * @property {Array<{key: string, values: string[], negate: boolean, raw: string}>} operators
 * @property {string[]} warnings
 * @property {boolean} empty
 */

export function parseQuery(input) {
  const text = String(input ?? "").trim();
  const result = { terms: [], operators: [], warnings: [], empty: text.length === 0, raw: text };
  if ( !text ) return result;
  const tokens = tokenize(text);
  for ( const tok of tokens ) {
    let negate = false;
    let body = tok;
    if ( body.startsWith("-") && body.length > 1 && !/^-\d/.test(body) ) { negate = true; body = body.slice(1); }
    const m = body.match(/^([a-zA-Z_]+):(.*)$/s);
    if ( m && !tok.startsWith("\"") ) {
      const key = m[1].toLowerCase();
      const rawValue = unquote(m[2]);
      if ( key in OPERATORS ) {
        if ( !rawValue.length ) { result.warnings.push(`Operator "${key}:" has no value and was ignored.`); continue; }
        const values = key === "folder" || key === "pack" || key === "collection" || key === "tag" ? splitValues(rawValue) : splitValues(rawValue).map(v => v.toLowerCase());
        result.operators.push({ key, values, negate, raw: tok });
        continue;
      }
      result.warnings.push(`Unknown operator "${key}:" was searched as plain text.`);
      result.terms.push({ value: body.toLowerCase(), negate, phrase: false });
      continue;
    }
    const phrase = body.startsWith("\"");
    const value = unquote(body).toLowerCase();
    if ( !value ) continue;
    result.terms.push({ value, negate, phrase });
  }
  result.empty = !result.terms.length && !result.operators.length;
  return result;
}

function tokenize(text) {
  const tokens = [];
  const re = /(-?[a-zA-Z_]+:"[^"]*"?)|(-?"[^"]*"?)|(\S+)/g;
  let m;
  while ( (m = re.exec(text)) ) tokens.push(m[0]);
  return tokens;
}

function unquote(s) {
  let v = String(s ?? "").trim();
  if ( v.startsWith("\"") ) v = v.slice(1);
  if ( v.endsWith("\"") ) v = v.slice(0, -1);
  return v.trim();
}

function splitValues(s) {
  return s.split(",").map(v => v.trim()).filter(Boolean);
}

/**
 * Parse a numeric comparison such as ">2000", "<=512", "1024", ">5mb", "2:30".
 * @returns {{op: string, value: number}|null}
 */
export function parseComparison(raw, { bytes=false, time=false }={}) {
  const m = String(raw ?? "").trim().match(/^(>=|<=|>|<|=)?\s*(.+)$/);
  if ( !m ) return null;
  const op = m[1] ?? "=";
  const v = m[2].trim().toLowerCase();
  let value;
  if ( time && /^\d+:\d{1,2}(:\d{1,2})?$/.test(v) ) {
    const parts = v.split(":").map(Number);
    value = parts.reduce((acc, p) => acc * 60 + p, 0);
  } else if ( bytes ) {
    const bm = v.match(/^([\d.]+)\s*(b|kb|mb|gb|k|m|g)?$/);
    if ( !bm ) return null;
    const mult = { b: 1, k: 1024, kb: 1024, m: 1024 ** 2, mb: 1024 ** 2, g: 1024 ** 3, gb: 1024 ** 3 }[bm[2] ?? "b"];
    value = parseFloat(bm[1]) * mult;
  } else {
    value = parseFloat(v);
  }
  if ( !Number.isFinite(value) ) return null;
  return { op, value };
}

export function compare(actual, { op, value }) {
  if ( !Number.isFinite(actual) ) return false;
  switch ( op ) {
    case ">": return actual > value;
    case ">=": return actual >= value;
    case "<": return actual < value;
    case "<=": return actual <= value;
    default: return Math.abs(actual - value) < 1e-9 || Math.round(actual) === Math.round(value);
  }
}
