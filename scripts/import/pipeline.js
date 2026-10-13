import { INPUT_FORMATS } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { detectFormat } from "./format-detector.js";
import { createBundle } from "./schema.js";
import { parseStatBlock, splitStatBlocks } from "./parsers/statblock-parser.js";
import { parseItemBlock, splitItemBlocks } from "./parsers/item-parser.js";
import { parseSpellBlock, splitSpellBlocks } from "./parsers/spell-parser.js";
import { parseCharacterSheet } from "./parsers/character-parser.js";
import { parseSchemaJSON } from "./parsers/json-parser.js";
import { parseFoundryExport } from "./parsers/foundry-export-parser.js";
import { parseCSVItems } from "./parsers/csv-parser.js";
import { interpret } from "../rules/interpreter.js";
import { normalizeEntry } from "./normalizer.js";

/**
 * Format-independent import pipeline, stages 1–8 of the specification:
 * acquisition is done by the caller (input-manager); this function covers detection, normalization,
 * parsing, interpretation, rule/compatibility analysis (delegated to the automation planner) and
 * validation. The result is a bundle ready for preview.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.filename]
 * @param {string} [options.contentKind]  Force a content kind: statblock | item | spell | character.
 * @param {boolean} [options.interpret=true]
 * @returns {object} bundle
 */
export function runPipeline(text, options={}) {
  const log = diagnostics.collector("pipeline");
  const detection = detectFormat(text, { filename: options.filename });
  const bundle = createBundle({ format: detection.format, reference: options.filename ?? null, text: String(text ?? "") });
  bundle.detection = { format: detection.format, contentKind: options.contentKind ?? detection.contentKind, confidence: detection.confidence, scores: detection.scores };
  if ( detection.error ) log.error(detection.error);
  const entries = [];
  const warn = (w) => log.warn(w);
  try {
    switch ( detection.format ) {
      case INPUT_FORMATS.FOUNDRY_EXPORT: {
        const r = parseFoundryExport(detection.json); r.warnings.forEach(warn); entries.push(...r.entries); break;
      }
      case INPUT_FORMATS.JSON_SCHEMA: {
        if ( detection.contentKind === "unknown-json" ) { log.error("JSON does not match the module schema or a Foundry export."); break; }
        const r = parseSchemaJSON(detection.json); r.warnings.forEach(warn); entries.push(...r.entries); break;
      }
      case INPUT_FORMATS.CSV: {
        const r = parseCSVItems(detection.text); r.warnings.forEach(warn); entries.push(...r.entries); break;
      }
      case INPUT_FORMATS.UNKNOWN: break;
      default: {
        const kind = options.contentKind ?? detection.contentKind;
        entries.push(...parseText(detection.text, kind, log));
      }
    }
  } catch (err) {
    log.error(`Parsing failed: ${err.message}`);
  }
  for ( const entry of entries ) {
    try {
      if ( options.interpret !== false ) interpret(entry);
      normalizeEntry(entry);
      for ( const w of entry.warnings ?? [] ) log.warn(`${entry.name}: ${w}`);
      for ( const e of entry.validation?.errors ?? [] ) log.error(`${entry.name}: ${e}`);
    } catch (err) {
      log.error(`${entry.name}: interpretation failed: ${err.message}`);
      entry.validation = { errors: [err.message], warnings: [], valid: false };
    }
  }
  bundle.entries = entries;
  bundle.diagnostics = log.items;
  bundle.summary = summarize(bundle);
  return bundle;
}

function parseText(text, kind, log) {
  const out = [];
  const tryParse = (fn, block) => { try { out.push(fn(block)); } catch (err) { log.error(`Could not parse block: ${err.message}`); } };
  switch ( kind ) {
    case "statblock": for ( const b of splitStatBlocks(text) ) tryParse(parseStatBlock, b); break;
    case "spell": for ( const b of splitSpellBlocks(text) ) tryParse(parseSpellBlock, b); break;
    case "item": for ( const b of splitItemBlocks(text) ) tryParse(parseItemBlock, b); break;
    case "character": tryParse(parseCharacterSheet, text); break;
    default: log.error("Could not determine what kind of content this is. Choose the content type manually.");
  }
  return out;
}

export function summarize(bundle) {
  const s = { actors: 0, items: 0, embeddedItems: 0, effects: 0, mechanics: { total: 0, native: 0, declarative: 0, integration: 0, module: 0, interactive: 0, unresolved: 0, review: 0 }, errors: bundle.diagnostics.filter(d => d.level === "error").length, warnings: bundle.diagnostics.filter(d => d.level === "warn").length };
  const countMech = (m) => { s.mechanics.total++; s.mechanics[m.category] = (s.mechanics[m.category] ?? 0) + 1; if ( m.reviewRequired ) s.mechanics.review++; };
  const countItem = (item) => { s.effects += item.effects?.length ?? 0; (item.mechanics ?? []).forEach(countMech); (item.contents ?? []).forEach(countItem); };
  for ( const e of bundle.entries ) {
    if ( e.kind === "actor" ) { s.actors++; for ( const i of e.items ?? [] ) { s.embeddedItems++; countItem(i); } }
    else { s.items++; countItem(e); }
  }
  return s;
}

export const pipeline = { run: runPipeline, detectFormat, summarize };
