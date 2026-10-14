import { DOCUMENT_TYPES, MODULE_ID, MODULE_VERSION } from "./constants.js";
import diagnostics from "./diagnostics.js";
import { getSetting, registerSettings, SETTINGS } from "./settings.js";
import { canUseBrowser } from "./permissions.js";
import { buildServices, moduleApi } from "./services.js";
import { AssetBrowserApplication } from "../applications/browser-app.js";
import { DiagnosticsApplication } from "../applications/diagnostics-app.js";

/**
 * Hook registration lives here so it is easy to audit what the module touches:
 *  - init:   settings, keybinding, API
 *  - ready:  service graph, scene-control button, document hooks that keep the catalog current
 */
let services = null;
let browser = null;

export function registerLifecycle() {
  Hooks.once("init", onInit);
  Hooks.once("ready", onReady);
  Hooks.on("getSceneControlButtons", onSceneControls);
}

function onInit() {
  diagnostics.info(`Initializing ${MODULE_ID} v${MODULE_VERSION}`);
  registerSettings();
  diagnostics.level = getSetting(SETTINGS.DEBUG) ? "debug" : "info";
  try {
    game.keybindings.register(MODULE_ID, "open", {
      name: "GMAL.Keybinding.Open.Name", hint: "GMAL.Keybinding.Open.Hint",
      editable: [{ key: "KeyL", modifiers: ["Control", "Shift"] }],
      onDown: () => { openBrowser(); return true; },
      restricted: false
    });
  } catch (err) { diagnostics.warn("Could not register keybinding", err); }
  const mod = game.modules.get(MODULE_ID);
  mod.api = moduleApi({ get catalog() { return services?.catalog; }, get search() { return services?.search; }, reindex: o => services?.reindex(o), extensions: { registerAdapter: (a, o) => services?.extensions.registerAdapter(a, o), registerAction: (a, o) => services?.extensions.registerAction(a, o) } }, { openBrowser, openDiagnostics });
}

function onReady() {
  services = buildServices();
  // Replace the init-time API with the fully wired one.
  game.modules.get(MODULE_ID).api = moduleApi(services, { openBrowser, openDiagnostics });
  registerDocumentHooks();
  Hooks.callAll(`${MODULE_ID}.ready`, game.modules.get(MODULE_ID).api);
  diagnostics.info("Ready");
}

export function openBrowser() {
  if ( !canUseBrowser() ) { ui.notifications?.warn(game.i18n.localize("GMAL.NoAccess")); return null; }
  if ( !services ) { ui.notifications?.warn(game.i18n.localize("GMAL.NotReady")); return null; }
  if ( browser?.rendered ) { browser.bringToFront(); return browser; }
  browser = new AssetBrowserApplication({ services });
  browser.render({ force: true });
  return browser;
}

export function openDiagnostics() {
  if ( !services ) return null;
  const app = new DiagnosticsApplication({ services });
  app.render({ force: true });
  return app;
}

/** Scene controls: a button in the Tokens control group (V13+/V14 record-based structure). */
function onSceneControls(controls) {
  if ( !canUseBrowser() ) return;
  const group = controls.tokens ?? controls.token ?? Object.values(controls)[0];
  if ( !group?.tools ) return;
  group.tools[`${MODULE_ID}-open`] = {
    name: `${MODULE_ID}-open`,
    title: "GMAL.Title",
    icon: "fa-solid fa-images",
    button: true,
    order: 100,
    visible: true,
    onChange: () => openBrowser()
  };
}

/** Keep world document records current while the browser is open. */
function registerDocumentHooks() {
  const upsert = (doc, documentName) => {
    if ( !services || !browser?.rendered ) return;
    if ( !doc?.uuid || doc.pack || doc.isEmbedded ) return;
    try {
      for ( const rec of services.describeDocument(doc, documentName) ) services.catalog.upsert(rec, "world");
    } catch (err) { diagnostics.debug(`Live update failed for ${documentName}`, err); }
  };
  const remove = doc => {
    if ( !services || !doc?.uuid || doc.pack ) return;
    services.catalog.remove(`doc:${doc.uuid}`);
    if ( doc.documentName === "Playlist" ) for ( const s of doc.sounds ?? [] ) services.catalog.remove(`doc:${s.uuid}`);
  };
  for ( const name of Object.keys(DOCUMENT_TYPES) ) {
    if ( !DOCUMENT_TYPES[name].collection ) continue;
    Hooks.on(`create${name}`, doc => upsert(doc, name));
    Hooks.on(`update${name}`, doc => upsert(doc, name));
    Hooks.on(`delete${name}`, doc => remove(doc));
  }
  for ( const emb of ["PlaylistSound", "JournalEntryPage"] ) {
    const refreshParent = doc => { const parent = doc?.parent; if ( parent && !parent.pack ) upsert(parent, parent.documentName); if ( emb === "PlaylistSound" && doc?.uuid ) services?.catalog.remove(`doc:${doc.uuid}`); };
    Hooks.on(`create${emb}`, doc => { const p = doc?.parent; if ( p && !p.pack ) upsert(p, p.documentName); });
    Hooks.on(`update${emb}`, doc => { const p = doc?.parent; if ( p && !p.pack ) upsert(p, p.documentName); });
    Hooks.on(`delete${emb}`, refreshParent);
  }
  // Another GM edited shared organization data: reload stores.
  Hooks.on("updateSetting", setting => {
    if ( !services || !String(setting?.key ?? "").startsWith(`${MODULE_ID}.store`) ) return;
    services.organization.reload();
  });
}
