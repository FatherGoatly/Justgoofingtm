import { MODULE_ID, MODULE_VERSION } from "./constants.js";
import diagnostics from "./diagnostics.js";
import { registerSettings, getSetting, SETTINGS } from "./settings.js";
import { compatibility, verifyEnvironment } from "./compatibility.js";
import { registerIntegrations } from "../automation/integrations/index.js";
import { runtime } from "../automation/runtime.js";
import { triggerRegistry } from "../automation/trigger-registry.js";
import { buildApi } from "./api.js";
import { registerUI } from "../ui/index.js";

/**
 * Module lifecycle. Keeps hook registration in one place so it is easy to audit what the module
 * touches in the host environment.
 */
export function registerLifecycle() {
  Hooks.once("init", onInit);
  Hooks.once("setup", onSetup);
  Hooks.once("ready", onReady);
}

function onInit() {
  diagnostics.info(`Initializing ${MODULE_ID} v${MODULE_VERSION}`);
  registerSettings();
  diagnostics.level = getSetting(SETTINGS.DEBUG_MODE) ? "debug" : getSetting(SETTINGS.LOG_LEVEL);
  registerIntegrations(compatibility);
  const mod = game.modules.get(MODULE_ID);
  mod.api = buildApi();
  globalThis.StatBlockImporter = mod.api;
  registerUI();
}

function onSetup() {
  // Integrations may need other modules' setup to have run before we read their APIs.
}

function onReady() {
  const env = verifyEnvironment();
  if ( !env.ok ) {
    for ( const p of env.problems ) {
      diagnostics.error(p);
      if ( game.user.isGM ) ui.notifications.error(`${MODULE_ID}: ${p}`, { permanent: true });
    }
  }
  const report = compatibility.detect();
  for ( const adapter of compatibility.adapters ) {
    const status = report.integrations.find(i => i.id === adapter.id);
    if ( status?.active ) {
      try { adapter.initialize?.(); } catch (err) { diagnostics.error(`Integration ${adapter.id} failed to initialize`, err); }
    }
  }
  triggerRegistry.activate(compatibility);
  runtime.ready({ compatibility, triggerRegistry });
  Hooks.callAll(`${MODULE_ID}.ready`, game.modules.get(MODULE_ID).api);
  diagnostics.info("Ready", { report });
}
