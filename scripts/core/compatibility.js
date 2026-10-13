import { MODULE_ID, MODULE_VERSION } from "./constants.js";
import diagnostics from "./diagnostics.js";
import { enabledIntegrations } from "./settings.js";

/**
 * Compatibility detection and the capability registry.
 *
 * Integration adapters register themselves here with a detection function; the automation runtime
 * queries `capabilities` to decide how a mechanic is implemented. Nothing in the core references an
 * optional module API directly.
 */

/** Tested combinations. "tested" means exercised in a real Foundry world; "mock" means adapter tests only. */
export const COMPATIBILITY_MATRIX = Object.freeze([
  { id: "core", name: "Foundry VTT", min: "14.367", verified: "14.369", status: "verified-by-source", notes: "Document schemas verified against dnd5e 6.0.6 sources targeting 14.367+." },
  { id: "dnd5e", name: "D&D 5e system", min: "6.0.0", verified: "6.0.6", status: "verified-by-source", notes: "Item/Actor/Activity/Effect data models read from release-6.0.6." },
  { id: "midi-qol", name: "Midi-QOL", min: "14.6.0", verified: "14.6.2", status: "mock", notes: "Adapter uses documented workflow hooks and `function.` on-use macros. Requires dae." },
  { id: "dae", name: "Dynamic Active Effects", min: "14.6.0", verified: "14.6.1", status: "mock", notes: "Special durations and extended effect keys." },
  { id: "dfreds-convenient-effects", name: "DFreds Convenient Effects", min: "7.0.0", verified: "7.0.0", status: "mock", notes: "Reuses existing effect definitions by name." },
  { id: "times-up", name: "Times Up", min: "14.0.0", verified: "14.0.0", status: "mock", notes: "On V14 only sets the core expiry action; durations are owned by core/dnd5e." },
  { id: "tidy5e-sheet", name: "Tidy 5e Sheets", min: "0.0", verified: "V14 branch", status: "mock", notes: "Presentation only; imported data stays valid in base dnd5e sheets." }
]);

class CompatibilityRegistry {
  /** @type {Map<string, object>} */
  #adapters = new Map();

  /** @type {Map<string, object>} capability id → { adapter, priority, meta } */
  #capabilities = new Map();

  #report = null;

  /**
   * Register an integration adapter.
   * @param {object} adapter  See automation/integrations/base-adapter.js
   */
  registerAdapter(adapter) {
    if ( !adapter?.id ) throw new Error("Adapter requires an id");
    this.#adapters.set(adapter.id, adapter);
  }

  get adapters() { return [...this.#adapters.values()]; }

  getAdapter(id) { return this.#adapters.get(id); }

  /**
   * Run detection for all adapters and build the capability registry.
   * @returns {object} The compatibility report.
   */
  detect() {
    const enabled = enabledIntegrations();
    const report = {
      module: { id: MODULE_ID, version: MODULE_VERSION },
      core: { version: globalThis.game?.version ?? null },
      system: { id: globalThis.game?.system?.id ?? null, version: globalThis.game?.system?.version ?? null },
      integrations: [],
      capabilities: []
    };
    this.#capabilities.clear();
    for ( const adapter of this.#adapters.values() ) {
      const status = { id: adapter.id, name: adapter.name, enabled: enabled.has(adapter.id), installed: false, active: false, version: null, compatible: false, capabilities: [], notes: [] };
      try {
        const detection = adapter.detect();
        Object.assign(status, detection);
        status.active = Boolean(status.installed && status.active && status.enabled && status.compatible);
        if ( status.active ) {
          for ( const cap of adapter.capabilities ?? [] ) {
            const existing = this.#capabilities.get(cap.id);
            if ( !existing || (cap.priority ?? 0) > existing.priority ) {
              this.#capabilities.set(cap.id, { adapter, priority: cap.priority ?? 0, meta: cap });
            }
            status.capabilities.push(cap.id);
          }
        }
      } catch (err) {
        status.notes.push(`Detection failed: ${err.message}`);
        diagnostics.warn(`Integration ${adapter.id} detection failed`, err);
      }
      report.integrations.push(status);
    }
    report.capabilities = [...this.#capabilities.keys()];
    this.#report = report;
    diagnostics.info("Compatibility detection complete", report);
    return report;
  }

  get report() { return this.#report ?? this.detect(); }

  /**
   * Query a capability.
   * @param {string} id
   * @returns {{adapter: object, priority: number, meta: object}|null}
   */
  capability(id) { return this.#capabilities.get(id) ?? null; }

  hasCapability(id) { return this.#capabilities.has(id); }

  /** Reset (tests). */
  reset() { this.#adapters.clear(); this.#capabilities.clear(); this.#report = null; }
}

export const compatibility = new CompatibilityRegistry();

/**
 * Compare semantic-ish version strings. Returns -1, 0 or 1.
 */
export function compareVersions(a, b) {
  const pa = String(a ?? "0").split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const pb = String(b ?? "0").split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for ( let i = 0; i < n; i++ ) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if ( x !== y ) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Verify the host environment satisfies the module's hard requirements.
 * @returns {{ok: boolean, problems: string[]}}
 */
export function verifyEnvironment() {
  const problems = [];
  const sys = globalThis.game?.system;
  if ( !sys || sys.id !== "dnd5e" ) problems.push("The D&D 5e system is required.");
  else if ( compareVersions(sys.version, "6.0.0") < 0 ) problems.push(`dnd5e ${sys.version} is older than the supported 6.0.0.`);
  else if ( compareVersions(sys.version, "7.0.0") >= 0 ) problems.push(`dnd5e ${sys.version} is newer than the tested 6.x line; data schemas may differ.`);
  const core = globalThis.game?.version;
  if ( core && compareVersions(core, "14.367") < 0 ) problems.push(`Foundry ${core} is older than 14.367.`);
  return { ok: problems.length === 0, problems };
}

/**
 * Detect the installed version of a module.
 * @param {string} id
 * @returns {{installed: boolean, active: boolean, version: string|null}}
 */
export function moduleStatus(id) {
  const mod = globalThis.game?.modules?.get?.(id);
  return { installed: Boolean(mod), active: Boolean(mod?.active), version: mod?.version ?? null };
}
