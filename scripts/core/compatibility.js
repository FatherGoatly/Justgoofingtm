import { MODULE_ID } from "./constants.js";

/**
 * Compatibility facts about the environment the academy is running in. Everything here reads Foundry state
 * defensively so it can also run in tests with a partial mock.
 */

/** The Foundry generation this build was written and verified against. */
export const SUPPORTED_FOUNDRY = Object.freeze({ minimum: 14, verified: "14.369" });

/** Game systems with a dedicated adapter and curriculum. */
export const SUPPORTED_SYSTEMS = Object.freeze({
  dnd5e: { minimum: "6.0.0", verified: "6.0.6" }
});

/** Optional modules the curriculum knows how to detect. Versions are the ones whose source was read. */
export const KNOWN_MODULES = Object.freeze({
  "midi-qol": { title: "Midi-QOL", verified: "14.6.2", minimum: "14.0.0", global: "MidiQOL" },
  "dae": { title: "Dynamic Active Effects", verified: null, minimum: null, global: "DAE" },
  "times-up": { title: "Times Up", verified: null, minimum: null, global: null },
  "dfreds-convenient-effects": { title: "DFreds Convenient Effects", verified: null, minimum: null, global: null },
  "lib-wrapper": { title: "libWrapper", verified: null, minimum: null, global: "libWrapper" },
  "socketlib": { title: "socketlib", verified: null, minimum: null, global: "socketlib" }
});

/**
 * Compare two version strings. Mirrors foundry.utils.isNewerVersion when available.
 * @param {string} v1
 * @param {string} v0
 * @returns {boolean} Is v1 newer than v0?
 */
export function isNewerVersion(v1, v0) {
  if ( globalThis.foundry?.utils?.isNewerVersion ) return foundry.utils.isNewerVersion(v1, v0);
  const a = String(v1).split(".").map(n => parseInt(n, 10) || 0);
  const b = String(v0).split(".").map(n => parseInt(n, 10) || 0);
  for ( let i = 0; i < Math.max(a.length, b.length); i++ ) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if ( x !== y ) return x > y;
  }
  return false;
}

/**
 * Does v satisfy minimum (inclusive)?
 * @param {string} v
 * @param {string|null} minimum
 * @returns {boolean}
 */
export function satisfiesMinimum(v, minimum) {
  if ( !minimum ) return true;
  if ( !v ) return false;
  return v === minimum || isNewerVersion(v, minimum);
}

/**
 * @typedef {object} EnvironmentReport
 * @property {string} foundryVersion
 * @property {number} foundryGeneration
 * @property {boolean} foundrySupported
 * @property {{id:string, title:string, version:string}|null} system
 * @property {boolean} systemSupported         Does a dedicated adapter exist for the active system?
 * @property {boolean} systemVersionSupported  Is the version within the tested range?
 * @property {Array<{id:string,title:string,active:boolean,version:string|null,verified:string|null,supported:boolean,globalPresent:boolean|null}>} modules
 * @property {string[]} warnings
 */

/**
 * Build a report describing the environment.
 * @returns {EnvironmentReport}
 */
export function describeEnvironment() {
  const g = globalThis.game;
  const foundryVersion = g?.version ?? g?.release?.version ?? "unknown";
  const foundryGeneration = Number.parseInt(String(foundryVersion).split(".")[0], 10) || 0;
  const foundrySupported = foundryGeneration === SUPPORTED_FOUNDRY.minimum;
  const sys = g?.system ? { id: g.system.id, title: g.system.title ?? g.system.id, version: g.system.version ?? "unknown" } : null;
  const support = sys ? SUPPORTED_SYSTEMS[sys.id] : null;
  const systemSupported = Boolean(support);
  const systemVersionSupported = Boolean(support) && satisfiesMinimum(sys.version, support.minimum);
  const modules = Object.entries(KNOWN_MODULES).map(([id, info]) => {
    const mod = g?.modules?.get?.(id);
    const active = Boolean(mod?.active);
    const version = mod?.version ?? null;
    return {
      id,
      title: info.title,
      active,
      version,
      verified: info.verified,
      supported: active && satisfiesMinimum(version, info.minimum),
      globalPresent: info.global ? Boolean(globalThis[info.global]) : null
    };
  });
  const warnings = [];
  if ( !foundrySupported ) warnings.push(`Foundry ${foundryVersion} is outside the supported generation (${SUPPORTED_FOUNDRY.minimum}). The academy was built for V14; interfaces may not render correctly.`);
  if ( sys && !systemSupported ) warnings.push(`No system adapter exists for "${sys.id}". Core JavaScript and core Foundry lessons work; system-specific lessons are marked unavailable.`);
  if ( sys && systemSupported && !systemVersionSupported ) warnings.push(`${sys.title} ${sys.version} is older than the tested minimum ${support.minimum}. System lessons may reference APIs that differ.`);
  for ( const m of modules ) {
    if ( m.active && m.minimum && !m.supported ) warnings.push(`${m.title} ${m.version} is older than the verified version ${m.verified}.`);
    if ( m.active && m.globalPresent === false ) warnings.push(`${m.title} is active but its global API (${KNOWN_MODULES[m.id].global}) is not present yet. It may initialize later in the lifecycle.`);
  }
  return { foundryVersion, foundryGeneration, foundrySupported, system: sys, systemSupported, systemVersionSupported, modules, warnings, moduleId: MODULE_ID };
}

/**
 * Evaluate a lesson's declared requirements against the environment.
 * @param {object} requirements           Lesson requirements block
 * @param {EnvironmentReport} env
 * @returns {{available:boolean, reasons:string[]}}
 */
export function checkRequirements(requirements={}, env=describeEnvironment()) {
  const reasons = [];
  if ( requirements.system ) {
    const want = requirements.system;
    if ( !env.system || env.system.id !== want.id ) reasons.push(`Requires the ${want.title ?? want.id} game system (active system: ${env.system?.id ?? "none"}).`);
    else if ( want.minimum && !satisfiesMinimum(env.system.version, want.minimum) ) reasons.push(`Requires ${want.id} ${want.minimum} or newer (installed: ${env.system.version}).`);
  }
  for ( const mod of requirements.modules ?? [] ) {
    const found = env.modules.find(m => m.id === mod.id) ?? { active: Boolean(globalThis.game?.modules?.get?.(mod.id)?.active), version: globalThis.game?.modules?.get?.(mod.id)?.version ?? null };
    if ( mod.optional ) continue;
    if ( !found.active ) reasons.push(`Requires the module "${mod.title ?? mod.id}" to be active.`);
    else if ( mod.minimum && !satisfiesMinimum(found.version, mod.minimum) ) reasons.push(`Requires ${mod.id} ${mod.minimum}+ (installed: ${found.version}).`);
  }
  return { available: reasons.length === 0, reasons };
}
