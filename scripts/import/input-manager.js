import { ACCEPTED_FILE_TYPES, INPUT_FORMATS, LIMITS } from "../core/constants.js";
import { allowedFormats, getSetting, SETTINGS } from "../core/settings.js";

/**
 * Input acquisition: accepts pasted text or uploaded files, enforces size/type limits and the GM's
 * allowed-format policy. Remote URLs are never fetched automatically.
 */

export class InputError extends Error {}

/**
 * Validate pasted text.
 * @param {string} text
 * @returns {string}
 */
export function acceptText(text) {
  if ( typeof text !== "string" ) throw new InputError("Input must be text");
  const max = Number(getSetting(SETTINGS.MAX_INPUT_SIZE)) || LIMITS.MAX_TEXT_LENGTH;
  if ( text.length > max ) throw new InputError(`Input exceeds the maximum size of ${max} characters`);
  if ( !text.trim() ) throw new InputError("Input is empty");
  return text;
}

/**
 * Validate an uploaded File and read it as text.
 * @param {File} file
 * @returns {Promise<{text: string, filename: string, format: string}>}
 */
export async function acceptFile(file) {
  if ( !file ) throw new InputError("No file provided");
  const name = String(file.name ?? "upload");
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  const format = ACCEPTED_FILE_TYPES[ext];
  if ( !format ) throw new InputError(`File type "${ext || "unknown"}" is not accepted. Allowed: ${Object.keys(ACCEPTED_FILE_TYPES).join(", ")}`);
  if ( file.size > LIMITS.MAX_FILE_BYTES ) throw new InputError(`File exceeds ${LIMITS.MAX_FILE_BYTES} bytes`);
  const text = await file.text();
  return { text: acceptText(text), filename: name, format };
}

/**
 * Check a detected format against the GM's policy.
 * @param {string} format
 * @returns {{allowed: boolean, reason?: string}}
 */
export function checkFormatAllowed(format) {
  const allowed = allowedFormats();
  if ( format === INPUT_FORMATS.UNKNOWN ) return { allowed: false, reason: "Unknown format" };
  if ( format === INPUT_FORMATS.HTML && !getSetting(SETTINGS.ALLOW_HTML_INPUT) ) return { allowed: false, reason: "HTML input disabled" };
  if ( !allowed.has(format) ) return { allowed: false, reason: `Format ${format} is not enabled` };
  return { allowed: true };
}
