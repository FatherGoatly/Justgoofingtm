import { DESTINATION, DUPLICATE_POLICY, LIMITS, MODULE_ID } from "./constants.js";
import diagnostics from "./diagnostics.js";

/**
 * Settings definitions. Every GM-controlled setting uses the "world" scope so players cannot
 * override it; purely cosmetic preferences use the "client" scope.
 */
export const SETTINGS = Object.freeze({
  ALLOW_PLAYER_IMPORT: "allowPlayerImport",
  PLAYER_DESTINATIONS: "playerDestinations",
  ALLOWED_FORMATS: "allowedFormats",
  MAX_INPUT_SIZE: "maxInputSize",
  MAX_BATCH_SIZE: "maxBatchSize",
  AUTOMATION_ENABLED: "automationEnabled",
  USE_NATIVE_MECHANICS: "useNativeMechanics",
  INTEGRATIONS: "integrations",
  MACRO_POLICY: "macroPolicy",
  REVIEW_POLICY: "reviewPolicy",
  DUPLICATE_POLICY: "duplicatePolicy",
  STAGING_FOLDER: "stagingFolder",
  LOG_IMPORTS: "logImports",
  LOG_LEVEL: "logLevel",
  DEBUG_MODE: "debugMode",
  ALLOW_HTML_INPUT: "allowHtmlInput",
  OCR_ENABLED: "ocrEnabled",
  CLIENT_LAST_TAB: "lastTab"
});

export const MACRO_POLICIES = Object.freeze({ never: "never", gmOnly: "gmOnly", owners: "owners" });
export const REVIEW_POLICIES = Object.freeze({ always: "always", ambiguous: "ambiguous", never: "never" });

const DEFINITIONS = [
  { key: SETTINGS.ALLOW_PLAYER_IMPORT, type: Boolean, default: true, scope: "world", config: true },
  {
    key: SETTINGS.PLAYER_DESTINATIONS, type: String, default: "owned", scope: "world", config: true,
    choices: { owned: "SBI.Settings.PlayerDestinations.Owned", staging: "SBI.Settings.PlayerDestinations.Staging", both: "SBI.Settings.PlayerDestinations.Both" }
  },
  { key: SETTINGS.ALLOWED_FORMATS, type: String, default: "text,markdown,html,json-schema,foundry-export,csv", scope: "world", config: true },
  { key: SETTINGS.MAX_INPUT_SIZE, type: Number, default: LIMITS.MAX_TEXT_LENGTH, scope: "world", config: true, range: { min: 1000, max: 5_000_000, step: 1000 } },
  { key: SETTINGS.MAX_BATCH_SIZE, type: Number, default: LIMITS.MAX_BATCH, scope: "world", config: true, range: { min: 1, max: 500, step: 1 } },
  { key: SETTINGS.AUTOMATION_ENABLED, type: Boolean, default: true, scope: "world", config: true },
  { key: SETTINGS.USE_NATIVE_MECHANICS, type: Boolean, default: true, scope: "world", config: true },
  { key: SETTINGS.INTEGRATIONS, type: String, default: "midi-qol,dae,dfreds-convenient-effects,times-up,tidy5e-sheet", scope: "world", config: true },
  {
    key: SETTINGS.MACRO_POLICY, type: String, default: MACRO_POLICIES.gmOnly, scope: "world", config: true,
    choices: { never: "SBI.Settings.MacroPolicy.Never", gmOnly: "SBI.Settings.MacroPolicy.GMOnly", owners: "SBI.Settings.MacroPolicy.Owners" }
  },
  {
    key: SETTINGS.REVIEW_POLICY, type: String, default: REVIEW_POLICIES.ambiguous, scope: "world", config: true,
    choices: { always: "SBI.Settings.ReviewPolicy.Always", ambiguous: "SBI.Settings.ReviewPolicy.Ambiguous", never: "SBI.Settings.ReviewPolicy.Never" }
  },
  {
    key: SETTINGS.DUPLICATE_POLICY, type: String, default: DUPLICATE_POLICY.ASK, scope: "world", config: true,
    choices: {
      ask: "SBI.Settings.DuplicatePolicy.Ask", create: "SBI.Settings.DuplicatePolicy.Create", skip: "SBI.Settings.DuplicatePolicy.Skip",
      update: "SBI.Settings.DuplicatePolicy.Update", merge: "SBI.Settings.DuplicatePolicy.Merge"
    }
  },
  { key: SETTINGS.STAGING_FOLDER, type: String, default: "Imported (Staging)", scope: "world", config: true },
  { key: SETTINGS.LOG_IMPORTS, type: Boolean, default: true, scope: "world", config: true },
  {
    key: SETTINGS.LOG_LEVEL, type: String, default: "info", scope: "world", config: true,
    choices: { error: "SBI.Settings.LogLevel.Error", warn: "SBI.Settings.LogLevel.Warn", info: "SBI.Settings.LogLevel.Info", debug: "SBI.Settings.LogLevel.Debug" }
  },
  { key: SETTINGS.DEBUG_MODE, type: Boolean, default: false, scope: "world", config: true },
  { key: SETTINGS.ALLOW_HTML_INPUT, type: Boolean, default: true, scope: "world", config: true },
  { key: SETTINGS.OCR_ENABLED, type: Boolean, default: false, scope: "world", config: true },
  { key: SETTINGS.CLIENT_LAST_TAB, type: String, default: "source", scope: "client", config: false }
];

/**
 * Register all settings with Foundry. Must be called during the `init` hook.
 */
export function registerSettings() {
  for ( const def of DEFINITIONS ) {
    const data = {
      name: `SBI.Settings.${capitalize(def.key)}.Name`,
      hint: `SBI.Settings.${capitalize(def.key)}.Hint`,
      scope: def.scope,
      config: def.config,
      type: def.type,
      default: def.default
    };
    if ( def.choices ) data.choices = def.choices;
    if ( def.range ) data.range = def.range;
    if ( def.key === SETTINGS.LOG_LEVEL ) data.onChange = v => diagnostics.level = v;
    if ( def.key === SETTINGS.DEBUG_MODE ) data.onChange = v => { if ( v ) diagnostics.level = "debug"; };
    game.settings.register(MODULE_ID, def.key, data);
  }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * Read a setting, falling back to its default when Foundry is not available (tests).
 * @param {string} key
 * @returns {*}
 */
export function getSetting(key) {
  const def = DEFINITIONS.find(d => d.key === key);
  try {
    if ( globalThis.game?.settings?.get ) return game.settings.get(MODULE_ID, key);
  } catch (err) {
    diagnostics.debug(`Setting ${key} unavailable, using default`, err);
  }
  return def?.default;
}

export async function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}

/** @returns {Set<string>} enabled input formats */
export function allowedFormats() {
  return new Set(String(getSetting(SETTINGS.ALLOWED_FORMATS) ?? "").split(",").map(s => s.trim()).filter(Boolean));
}

/** @returns {Set<string>} module ids whose integration is enabled by the GM */
export function enabledIntegrations() {
  return new Set(String(getSetting(SETTINGS.INTEGRATIONS) ?? "").split(",").map(s => s.trim()).filter(Boolean));
}

/** Player destination policy helpers. */
export function playerDestinations() {
  const v = getSetting(SETTINGS.PLAYER_DESTINATIONS);
  if ( v === "both" ) return new Set([DESTINATION.ACTOR, DESTINATION.STAGING]);
  if ( v === "staging" ) return new Set([DESTINATION.STAGING]);
  return new Set([DESTINATION.ACTOR]);
}

export { DEFINITIONS as SETTING_DEFINITIONS };
