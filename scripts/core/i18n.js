import { MODULE_ID } from "./constants.js";

/**
 * Localize a key under the module namespace with a graceful fallback when the string is missing or when the
 * engine is used outside Foundry (tests).
 * @param {string} key                  Key relative to the module namespace, e.g. "Dashboard.Title"
 * @param {Record<string, unknown>} [data]
 * @returns {string}
 */
export function t(key, data) {
  const full = key.includes(".") && key.startsWith(`${MODULE_ID}.`) ? key : `GMMA.${key}`;
  const i18n = globalThis.game?.i18n;
  if ( i18n?.has?.(full) ) return data ? i18n.format(full, data) : i18n.localize(full);
  // Fallback: humanize the last key segment.
  let text = key.split(".").pop().replace(/([a-z])([A-Z])/g, "$1 $2");
  if ( data ) for ( const [k, v] of Object.entries(data) ) text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return text;
}
