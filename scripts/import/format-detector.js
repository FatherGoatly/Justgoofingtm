import { INPUT_FORMATS } from "../core/constants.js";
import { isModuleSchema, safeParseJSON } from "./parsers/json-parser.js";
import { isFoundryExport } from "./parsers/foundry-export-parser.js";
import { looksLikeCSV, looksLikeHTML, looksLikeMarkdown, htmlToText, markdownToText } from "./parsers/markup.js";
import { scoreStatBlock } from "./parsers/statblock-parser.js";
import { scoreItemBlock } from "./parsers/item-parser.js";
import { scoreSpellBlock } from "./parsers/spell-parser.js";
import { scoreCharacterSheet } from "./parsers/character-parser.js";

/**
 * Detect the input format and the probable content kind.
 * @param {string} text
 * @param {object} [hints]  { filename?: string }
 * @returns {{format: string, contentKind: string, confidence: number, text: string, json: object|null, scores: object}}
 */
export function detectFormat(text, hints={}) {
  const raw = String(text ?? "");
  const trimmed = raw.trim();
  const ext = (hints.filename ?? "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  // JSON
  if ( (trimmed.startsWith("{") || trimmed.startsWith("[")) || ext === ".json" ) {
    try {
      const json = safeParseJSON(trimmed);
      if ( isFoundryExport(json) ) return { format: INPUT_FORMATS.FOUNDRY_EXPORT, contentKind: "foundry", confidence: 1, text: trimmed, json, scores: {} };
      if ( isModuleSchema(json) ) return { format: INPUT_FORMATS.JSON_SCHEMA, contentKind: "schema", confidence: 1, text: trimmed, json, scores: {} };
      return { format: INPUT_FORMATS.JSON_SCHEMA, contentKind: "unknown-json", confidence: 0.2, text: trimmed, json, scores: {} };
    } catch (err) {
      if ( ext === ".json" ) return { format: INPUT_FORMATS.UNKNOWN, contentKind: "invalid-json", confidence: 0, text: trimmed, json: null, scores: {}, error: err.message };
    }
  }
  // CSV
  if ( ext === ".csv" || (looksLikeCSV(trimmed) && !looksLikeHTML(trimmed)) ) {
    return { format: INPUT_FORMATS.CSV, contentKind: "items", confidence: ext === ".csv" ? 1 : 0.6, text: trimmed, json: null, scores: {} };
  }
  // HTML / Markdown → text
  let format = INPUT_FORMATS.TEXT;
  let plain = trimmed;
  if ( ext === ".html" || ext === ".htm" || looksLikeHTML(trimmed) ) { format = INPUT_FORMATS.HTML; plain = htmlToText(trimmed); }
  else if ( ext === ".md" || ext === ".markdown" || looksLikeMarkdown(trimmed) ) { format = INPUT_FORMATS.MARKDOWN; plain = markdownToText(trimmed); }
  const scores = {
    statblock: scoreStatBlock(plain),
    spell: scoreSpellBlock(plain),
    item: scoreItemBlock(plain),
    character: scoreCharacterSheet(plain)
  };
  const [contentKind, confidence] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { format, contentKind: confidence > 0 ? contentKind : "unknown", confidence, text: plain, json: null, scores };
}
