/** Small text helpers without Foundry dependencies. */

/**
 * Format minutes as a human-readable duration.
 * @param {number} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  if ( !Number.isFinite(minutes) || minutes <= 0 ) return "";
  if ( minutes < 60 ) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Normalize whitespace for forgiving text comparisons.
 * @param {string} text
 * @returns {string}
 */
export function normalizeWhitespace(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").split("\n").map(l => l.trimEnd()).join("\n").trim();
}

/**
 * Compare two outputs while ignoring trailing whitespace and line-ending differences.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function looselyEqual(a, b) {
  return normalizeWhitespace(a) === normalizeWhitespace(b);
}

/**
 * Approximate byte size of a JSON-serializable value.
 * @param {unknown} value
 * @returns {number}
 */
export function byteSize(value) {
  try {
    const json = typeof value === "string" ? value : JSON.stringify(value);
    return new TextEncoder().encode(json ?? "").length;
  } catch(_err) {
    return Infinity;
  }
}

/**
 * Create a short unique id (not cryptographic). Foundry's randomID is used when available.
 * @param {number} [length=16]
 * @returns {string}
 */
export function shortId(length=16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const rnd = globalThis.crypto?.getRandomValues ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(length))) : Array.from({ length }, () => Math.floor(Math.random() * 256));
  for ( const n of rnd ) out += chars[n % chars.length];
  return out;
}

/**
 * Deep clone JSON-compatible data.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function clone(value) {
  if ( value === undefined ) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Truncate text with an ellipsis.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max=120) {
  const s = String(text ?? "");
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
