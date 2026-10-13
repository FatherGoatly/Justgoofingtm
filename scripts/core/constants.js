/**
 * Module-wide constants. Kept free of Foundry globals so it can be imported by tests.
 */
export const MODULE_ID = "stat-block-importer";
export const MODULE_TITLE = "Stat Block Importer";
export const MODULE_VERSION = "0.1.0";

/** Version of the mechanic specification format produced by the interpreter. */
export const MECHANIC_SPEC_VERSION = 1;

/** Version of the intermediate representation produced by the normalizer. */
export const IR_VERSION = 1;

/** Flag namespace stored on created documents. */
export const FLAG_SCOPE = MODULE_ID;

export const FLAGS = Object.freeze({
  /** Import provenance: { sourceId, fingerprint, format, importedAt, irVersion, moduleVersion } */
  IMPORT: "import",
  /** Array of mechanic specifications attached to an Item. */
  MECHANICS: "mechanics",
  /** Generated macro metadata stored on a Macro document. */
  MACRO: "macro",
  /** Per-document automation disable switch. */
  AUTOMATION_DISABLED: "automationDisabled",
  /** Marker written on Items created from a staging import. */
  STAGING: "staging"
});

/** Mechanic implementation categories (see spec section 7). */
export const MECHANIC_CATEGORY = Object.freeze({
  NATIVE: "native",
  DECLARATIVE: "declarative",
  INTEGRATION: "integration",
  MODULE: "module",
  INTERACTIVE: "interactive",
  UNRESOLVED: "unresolved"
});

/** Confidence labels with numeric thresholds. */
export const CONFIDENCE = Object.freeze({
  HIGH: 0.9,
  MEDIUM: 0.6,
  LOW: 0.3
});

export function confidenceLabel(value) {
  if ( value >= CONFIDENCE.HIGH ) return "high";
  if ( value >= CONFIDENCE.MEDIUM ) return "medium";
  if ( value >= CONFIDENCE.LOW ) return "low";
  return "none";
}

/** Supported input formats. */
export const INPUT_FORMATS = Object.freeze({
  TEXT: "text",
  MARKDOWN: "markdown",
  HTML: "html",
  JSON_SCHEMA: "json-schema",
  FOUNDRY_EXPORT: "foundry-export",
  CSV: "csv",
  UNKNOWN: "unknown"
});

/** Duplicate handling policies. */
export const DUPLICATE_POLICY = Object.freeze({
  CREATE: "create",
  SKIP: "skip",
  UPDATE: "update",
  MERGE: "merge",
  ASK: "ask"
});

/** Import destinations. */
export const DESTINATION = Object.freeze({
  WORLD: "world",
  ACTOR: "actor",
  STAGING: "staging",
  COMPENDIUM: "compendium"
});

/** Default resource limits (bytes / counts). */
export const LIMITS = Object.freeze({
  MAX_TEXT_LENGTH: 500_000,
  MAX_FILE_BYTES: 5_000_000,
  MAX_JSON_DEPTH: 24,
  MAX_BATCH: 50,
  MAX_FORMULA_LENGTH: 200,
  MAX_FORMULA_TERMS: 40,
  MAX_DICE_COUNT: 200,
  MAX_DIE_FACES: 1000
});

/** Accepted file extensions and their input format. */
export const ACCEPTED_FILE_TYPES = Object.freeze({
  ".txt": INPUT_FORMATS.TEXT,
  ".md": INPUT_FORMATS.MARKDOWN,
  ".markdown": INPUT_FORMATS.MARKDOWN,
  ".json": INPUT_FORMATS.JSON_SCHEMA,
  ".csv": INPUT_FORMATS.CSV,
  ".html": INPUT_FORMATS.HTML,
  ".htm": INPUT_FORMATS.HTML
});
