import { MODULE_ID, SETTINGS, ACCESS_MODES, LEARNING_MODES, OPEN_BEHAVIORS, LIVE_WARNING_MODES } from "./constants.js";
import { resetLiveConfirmation } from "../workshop/live-executor.js";

/**
 * Register all module settings. Called once in the init hook.
 * World settings are GM-controlled policy; user settings are personal preferences stored per user on the
 * server; the progress and draft records are user settings hidden from the configuration form.
 * @param {object} options
 * @param {Function} options.onPreferenceChange   Called with (key, value) when a user preference changes
 * @param {typeof foundry.applications.api.ApplicationV2} options.MenuApplication  Opened by the settings menu button
 */
export function registerSettings({ onPreferenceChange=() => {}, MenuApplication=null }={}) {
  const fields = foundry.data.fields;
  const L = key => `GMMA.Settings.${key}`;

  if ( MenuApplication ) {
    game.settings.registerMenu(MODULE_ID, "openAcademy", {
      name: L("OpenMenu.Name"), label: L("OpenMenu.Label"), hint: L("OpenMenu.Hint"), icon: "fa-solid fa-graduation-cap", type: MenuApplication, restricted: false
    });
  }

  // World
  game.settings.register(MODULE_ID, SETTINGS.ACCESS, {
    name: L("Access.Name"), hint: L("Access.Hint"), scope: "world", config: true,
    type: new fields.StringField({ required: true, choices: { [ACCESS_MODES.GM]: L("Access.GM"), [ACCESS_MODES.ALL]: L("Access.All") }, initial: ACCESS_MODES.GM }),
    default: ACCESS_MODES.GM, requiresReload: false
  });
  game.settings.register(MODULE_ID, SETTINGS.PLAYER_LIVE_EXECUTION, {
    name: L("PlayerLive.Name"), hint: L("PlayerLive.Hint"), scope: "world", config: true, type: new fields.BooleanField(), default: false,
    onChange: () => resetLiveConfirmation()
  });
  game.settings.register(MODULE_ID, SETTINGS.SHOW_SYSTEM_LESSONS, {
    name: L("ShowSystem.Name"), hint: L("ShowSystem.Hint"), scope: "world", config: true, type: new fields.BooleanField(), default: true,
    onChange: v => onPreferenceChange(SETTINGS.SHOW_SYSTEM_LESSONS, v)
  });

  // User preferences
  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_MODE, {
    name: L("DefaultMode.Name"), hint: L("DefaultMode.Hint"), scope: "user", config: true,
    type: new fields.StringField({ required: true, choices: { [LEARNING_MODES.GUIDED]: L("DefaultMode.Guided"), [LEARNING_MODES.WORKSHOP]: L("DefaultMode.Workshop"), [LEARNING_MODES.CHALLENGE]: L("DefaultMode.Challenge") }, initial: LEARNING_MODES.GUIDED }),
    default: LEARNING_MODES.GUIDED, onChange: v => onPreferenceChange(SETTINGS.DEFAULT_MODE, v)
  });
  game.settings.register(MODULE_ID, SETTINGS.EDITOR_FONT_SIZE, {
    name: L("FontSize.Name"), hint: L("FontSize.Hint"), scope: "user", config: true,
    type: new fields.NumberField({ required: true, integer: true, min: 10, max: 24, initial: 14 }), default: 14,
    onChange: v => onPreferenceChange(SETTINGS.EDITOR_FONT_SIZE, v)
  });
  game.settings.register(MODULE_ID, SETTINGS.REQUIRE_ASSESSMENT, {
    name: L("RequireAssessment.Name"), hint: L("RequireAssessment.Hint"), scope: "user", config: true, type: new fields.BooleanField({ initial: true }), default: true,
    onChange: v => onPreferenceChange(SETTINGS.REQUIRE_ASSESSMENT, v)
  });
  game.settings.register(MODULE_ID, SETTINGS.RECORD_ASSISTED, {
    name: L("RecordAssisted.Name"), hint: L("RecordAssisted.Hint"), scope: "user", config: true, type: new fields.BooleanField({ initial: true }), default: true,
    onChange: v => onPreferenceChange(SETTINGS.RECORD_ASSISTED, v)
  });
  game.settings.register(MODULE_ID, SETTINGS.NOTIFICATIONS, {
    name: L("Notifications.Name"), hint: L("Notifications.Hint"), scope: "user", config: true, type: new fields.BooleanField({ initial: true }), default: true
  });
  game.settings.register(MODULE_ID, SETTINGS.OPEN_BEHAVIOR, {
    name: L("OpenBehavior.Name"), hint: L("OpenBehavior.Hint"), scope: "user", config: true,
    type: new fields.StringField({ required: true, choices: { [OPEN_BEHAVIORS.DASHBOARD]: L("OpenBehavior.Dashboard"), [OPEN_BEHAVIORS.RESUME]: L("OpenBehavior.Resume") }, initial: OPEN_BEHAVIORS.DASHBOARD }),
    default: OPEN_BEHAVIORS.DASHBOARD
  });
  game.settings.register(MODULE_ID, SETTINGS.EXPORT_PROJECTS, {
    name: L("ExportProjects.Name"), hint: L("ExportProjects.Hint"), scope: "user", config: true, type: new fields.BooleanField({ initial: true }), default: true
  });
  game.settings.register(MODULE_ID, SETTINGS.LIVE_WARNING_MODE, {
    name: L("LiveWarning.Name"), hint: L("LiveWarning.Hint"), scope: "user", config: true,
    type: new fields.StringField({ required: true, choices: { [LIVE_WARNING_MODES.ALWAYS]: L("LiveWarning.Always"), [LIVE_WARNING_MODES.SESSION]: L("LiveWarning.Session") }, initial: LIVE_WARNING_MODES.ALWAYS }),
    default: LIVE_WARNING_MODES.ALWAYS, onChange: () => resetLiveConfirmation()
  });

  // User data (hidden)
  game.settings.register(MODULE_ID, SETTINGS.PROGRESS, { scope: "user", config: false, type: new fields.ObjectField(), default: {} });
  game.settings.register(MODULE_ID, SETTINGS.DRAFTS, { scope: "user", config: false, type: new fields.ObjectField(), default: {} });

  // Client
  game.settings.register(MODULE_ID, SETTINGS.WINDOW_STATE, { scope: "client", config: false, type: new fields.ObjectField(), default: {} });
}

/** Convenience getter with a fallback for use outside the Foundry runtime. */
export function getSetting(key, fallback=undefined) {
  try { return game.settings.get(MODULE_ID, key); } catch(_err) { return fallback; }
}

export async function setSetting(key, value) { return game.settings.set(MODULE_ID, key, value); }
