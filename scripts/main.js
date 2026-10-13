/**
 * Heroic & Villainous Actions — entry point.
 * Initialization is idempotent: every registration guards against repeated lifecycle events.
 */

import { MODULE_ID, MODULE_TITLE, MAX_PER_POOL, POOLS, ABILITY_MODES, MECHANIC_TYPES, ACTIVATION_POLICIES,
  ADVANTAGE_POLICIES, REROLL_POLICIES, ROLL_CATEGORIES } from "./constants.js";
import { registerSettings, getSetting, SETTINGS } from "./settings.js";
import { registerRollDetection } from "./roll-detector.js";
import { processRoll, processMessageRolls, registry } from "./roll-processor.js";
import { classifyRoll, determineCategory } from "./roll-classifier.js";
import { resourceManager } from "./resource-manager.js";
import { activateAbility, defineAbility, clearAbility, setApproval, dialogs } from "./ability-manager.js";
import { validateAbilityDefinition } from "./ability-schema.js";
import { registerSocket } from "./socket-service.js";
import { migrateWorld } from "./migration.js";
import { diagnostics } from "./diagnostics.js";
import { AbilityDefinitionDialog } from "./ui/ability-dialog.js";
import { confirmActivation } from "./ui/activation-dialog.js";
import { ActionPanel } from "./ui/action-panel.js";
import { GMManagement } from "./ui/gm-management.js";
import { SettingsHelp } from "./ui/settings-help.js";
import { registerSheetIntegration } from "./ui/sheet-integration.js";
import { registerMidiIntegration } from "./integrations/midi-qol.js";

let initialized = false;
let ready = false;

function registerHelpers() {
  if ( Handlebars.helpers["hva-split"] ) return;
  Handlebars.registerHelper("hva-split", value => String(value ?? "").split("\n"));
}

function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "openPanel", {
    name: "HVA.Keybind.OpenPanel",
    hint: "HVA.Keybind.OpenPanelHint",
    editable: [],
    onDown: () => { ActionPanel.open(null); return true; }
  });
}

function buildAPI() {
  return Object.freeze({
    MODULE_ID, MAX_PER_POOL, POOLS, ABILITY_MODES, MECHANIC_TYPES, ACTIVATION_POLICIES, ADVANTAGE_POLICIES,
    REROLL_POLICIES, ROLL_CATEGORIES,
    resources: resourceManager,
    abilities: { activate: activateAbility, define: defineAbility, clear: clearAbility, setApproval, validate: validateAbilityDefinition },
    rolls: { process: processRoll, processMessage: processMessageRolls, classify: classifyRoll, determineCategory, registry },
    diagnostics,
    ui: { openPanel: actor => ActionPanel.open(actor ?? null), openGM: () => new GMManagement().render({ force: true }), openHelp: () => new SettingsHelp().render({ force: true }) },
    settings: { get: getSetting, keys: SETTINGS }
  });
}

Hooks.once("init", () => {
  if ( initialized ) return;
  initialized = true;
  registerSettings({ GMManagement, SettingsHelp });
  registerHelpers();
  registerKeybindings();
  dialogs.define = AbilityDefinitionDialog.prompt;
  dialogs.confirm = confirmActivation;
  const module = game.modules.get(MODULE_ID);
  module.api = buildAPI();
  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/action-panel.hbs`,
    `modules/${MODULE_ID}/templates/define-ability.hbs`,
    `modules/${MODULE_ID}/templates/activation-confirm.hbs`,
    `modules/${MODULE_ID}/templates/gm-management.hbs`,
    `modules/${MODULE_ID}/templates/settings-help.hbs`,
    `modules/${MODULE_ID}/templates/sheet-card.hbs`,
    `modules/${MODULE_ID}/templates/chat-award.hbs`,
    `modules/${MODULE_ID}/templates/chat-activation.hbs`
  ]);
  console.log(`${MODULE_TITLE} | Initialized`);
});

Hooks.once("setup", () => {
  registerSocket();
  registerSheetIntegration();
});

Hooks.once("ready", async () => {
  if ( ready ) return;
  ready = true;
  if ( game.system.id !== "dnd5e" ) {
    ui.notifications.error(`${MODULE_TITLE}: this module requires the D&D 5e system.`);
    return;
  }
  const version = game.system.version ?? "0";
  if ( !foundry.utils.isNewerVersion(version, "5.99.99") ) {
    ui.notifications.warn(`${MODULE_TITLE}: tested with dnd5e 6.x; detected ${version}. Roll detection may not work.`);
  }
  registerRollDetection();
  registerMidiIntegration();
  await migrateWorld();
  Hooks.callAll(`${MODULE_ID}.ready`, game.modules.get(MODULE_ID).api);
  console.log(`${MODULE_TITLE} | Ready`);
});
