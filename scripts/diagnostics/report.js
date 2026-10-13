/**
 * Diagnostic report for troubleshooting. Contains versions, module status, permissions and compatibility
 * warnings. It deliberately excludes anything sensitive: no tokens, passwords, user emails, world data or
 * learner code.
 */
import { MODULE_ID } from "../core/constants.js";
import { describeEnvironment } from "../core/compatibility.js";
import { describeUserPermissions } from "../core/permissions.js";
import { INTEGRATIONS } from "../adapters/registry.js";
import { getActiveAdapter } from "../adapters/registry.js";

/**
 * Build the report object.
 * @param {object} [extra]  Extra sections supplied by the caller (e.g. progress summary, curriculum stats)
 * @returns {object}
 */
export function buildDiagnosticReport(extra={}) {
  const env = describeEnvironment();
  const user = describeUserPermissions();
  const adapter = getActiveAdapter(env);
  const integrations = Object.fromEntries(Object.entries(INTEGRATIONS).map(([id, i]) => [id, i.detect()]));
  const mod = globalThis.game?.modules?.get?.(MODULE_ID);
  return {
    generatedAt: new Date().toISOString(),
    module: { id: MODULE_ID, version: mod?.version ?? "unknown", active: Boolean(mod?.active) },
    foundry: { version: env.foundryVersion, supported: env.foundrySupported },
    system: env.system ? { ...env.system, adapter: adapter.constructor.id, adapterVerified: adapter.constructor.verified, versionSupported: env.systemVersionSupported } : null,
    user: { role: user.role, isGM: user.isGM, permissions: user.permissions },
    modules: env.modules,
    integrations,
    activeModuleCount: globalThis.game?.modules ? [...globalThis.game.modules].filter(m => m.active).length : null,
    browser: { userAgent: globalThis.navigator?.userAgent ?? "unknown", workers: typeof Worker === "function", language: globalThis.navigator?.language ?? "unknown" },
    warnings: env.warnings,
    ...extra
  };
}

/**
 * Format the report as readable text for copying into a bug report.
 * @param {object} report
 * @returns {string}
 */
export function formatDiagnosticReport(report) {
  const lines = [];
  lines.push(`# ${MODULE_ID} diagnostic report (${report.generatedAt})`);
  lines.push(`Module: ${report.module.version} (${report.module.active ? "active" : "inactive"})`);
  lines.push(`Foundry: ${report.foundry.version} (${report.foundry.supported ? "supported" : "UNSUPPORTED generation"})`);
  if ( report.system ) lines.push(`System: ${report.system.id} ${report.system.version} — adapter ${report.system.adapter} (verified ${report.system.adapterVerified?.verified ?? "n/a"}, version ${report.system.versionSupported ? "in range" : "OUT OF RANGE"})`);
  else lines.push("System: none");
  lines.push(`User role: ${report.user.role}${report.user.isGM ? " (GM)" : ""}`);
  lines.push(`Permissions: ${Object.entries(report.user.permissions).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  lines.push(`Active modules: ${report.activeModuleCount ?? "?"}`);
  lines.push("Known modules:");
  for ( const m of report.modules ) lines.push(`  - ${m.id}: ${m.active ? `active ${m.version}` : "inactive"}${m.active && m.verified ? ` (verified ${m.verified}${m.supported ? "" : ", BELOW MINIMUM"})` : ""}`);
  lines.push("Integrations:");
  for ( const [id, i] of Object.entries(report.integrations) ) lines.push(`  - ${id}: ${i.active ? `active ${i.version}, api ${i.apiPresent ? "present" : `missing ${i.missing.join(", ")}`}` : "inactive"}`);
  lines.push(`Browser: ${report.browser.userAgent}; workers=${report.browser.workers}`);
  if ( report.progress ) lines.push(`Progress: ${report.progress.completed}/${report.progress.total} lessons complete; ${report.progress.exercises} exercise records; schema ${report.progress.schemaVersion}`);
  if ( report.curriculum ) lines.push(`Curriculum: ${report.curriculum.lessons} lessons, ${report.curriculum.terms} glossary terms, packs ${report.curriculum.packs.join(", ")}; validation issues: ${report.curriculum.issues}`);
  if ( report.warnings?.length ) { lines.push("Warnings:"); for ( const w of report.warnings ) lines.push(`  ! ${w}`); }
  else lines.push("Warnings: none");
  return lines.join("\n");
}
