/**
 * World and client settings. Uses Foundry's ClientSettings API; world-scoped rules cannot be overridden by players.
 */

import {
  ACTIVATION_POLICIES,
  ADVANTAGE_POLICIES,
  CAP_BEHAVIORS,
  DEFAULT_CATEGORY_STATE,
  MODULE_ID,
  NOTIFICATION_MODES,
  REROLL_POLICIES,
  ROLL_CATEGORIES
} from "./constants.js";

export const SETTINGS = Object.freeze({
  ENABLE_HEROIC: "enableHeroic",
  ENABLE_VILLAINOUS: "enableVillainous",
  ADVANTAGE_POLICY: "advantagePolicy",
  REROLL_POLICY: "rerollPolicy",
  NPC_GENERATION: "npcGeneration",
  CAP_BEHAVIOR: "capBehavior",
  NOTIFICATION_MODE: "notificationMode",
  SHOW_TOASTS: "showToasts",
  COUNT_OUTSIDE_COMBAT: "countOutsideCombat",
  ACTIVATION_POLICY: "activationPolicy",
  ALLOW_ABILITY_OUTSIDE_COMBAT: "allowAbilityOutsideCombat",
  REQUIRE_GM_APPROVAL_AUTOMATION: "requireGMApprovalForAutomation",
  DEFAULT_COST: "defaultCost",
  PLAYERS_CAN_EDIT: "playersCanEditAbilities",
  PLAYERS_MANUAL_WITHOUT_APPROVAL: "playersCanUseManualWithoutApproval",
  REQUIRE_PUBLIC_CHAT: "requirePublicChat",
  ALLOW_ADMIN_OVERRIDE: "allowAdminOverride",
  LEGENDARY_USES_PER_ROUND: "legendaryUsesPerRound",
  DIAGNOSTICS: "diagnostics",
  SCHEMA_VERSION: "schemaVersion",
  SHOW_SHEET_CARD: "showSheetCard"
});

/** Settings key for a roll category toggle. */
export function categorySettingKey(category) {
  return `category-${category}`;
}

const CATEGORY_KEYS = Object.values(ROLL_CATEGORIES).filter(c => c !== ROLL_CATEGORIES.UNKNOWN);

/** Default values, also used when the settings API is unavailable (unit tests). */
export const SETTING_DEFAULTS = Object.freeze({
  [SETTINGS.ENABLE_HEROIC]: true,
  [SETTINGS.ENABLE_VILLAINOUS]: true,
  [SETTINGS.ADVANTAGE_POLICY]: ADVANTAGE_POLICIES.SELECTED,
  [SETTINGS.REROLL_POLICY]: REROLL_POLICIES.FINAL,
  [SETTINGS.NPC_GENERATION]: false,
  [SETTINGS.CAP_BEHAVIOR]: CAP_BEHAVIORS.NOTIFY,
  [SETTINGS.NOTIFICATION_MODE]: NOTIFICATION_MODES.PUBLIC,
  [SETTINGS.SHOW_TOASTS]: true,
  [SETTINGS.COUNT_OUTSIDE_COMBAT]: true,
  [SETTINGS.ACTIVATION_POLICY]: ACTIVATION_POLICIES.FLEXIBLE,
  [SETTINGS.ALLOW_ABILITY_OUTSIDE_COMBAT]: true,
  [SETTINGS.REQUIRE_GM_APPROVAL_AUTOMATION]: true,
  [SETTINGS.DEFAULT_COST]: 1,
  [SETTINGS.PLAYERS_CAN_EDIT]: true,
  [SETTINGS.PLAYERS_MANUAL_WITHOUT_APPROVAL]: true,
  [SETTINGS.REQUIRE_PUBLIC_CHAT]: false,
  [SETTINGS.ALLOW_ADMIN_OVERRIDE]: false,
  [SETTINGS.LEGENDARY_USES_PER_ROUND]: 1,
  [SETTINGS.DIAGNOSTICS]: false,
  [SETTINGS.SCHEMA_VERSION]: 0,
  [SETTINGS.SHOW_SHEET_CARD]: true,
  ...Object.fromEntries(CATEGORY_KEYS.map(c => [categorySettingKey(c), DEFAULT_CATEGORY_STATE[c] ?? false]))
});

/**
 * Read a setting, falling back to the default when the settings API is unavailable or the key is unregistered.
 * @param {string} key
 * @returns {*}
 */
export function getSetting(key) {
  try {
    if ( globalThis.game?.settings?.get ) return game.settings.get(MODULE_ID, key);
  } catch {
    // Unregistered (e.g. during early init) or running outside Foundry.
  }
  return SETTING_DEFAULTS[key];
}

/**
 * Write a setting (world settings require GM).
 * @param {string} key
 * @param {*} value
 */
export async function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}

/** Whether a roll category currently generates resources. */
export function isCategoryEnabled(category) {
  if ( category === ROLL_CATEGORIES.UNKNOWN ) return false;
  return getSetting(categorySettingKey(category)) === true;
}

/** Snapshot of the classification policy for the roll classifier. */
export function getClassifierPolicy() {
  return {
    advantagePolicy: getSetting(SETTINGS.ADVANTAGE_POLICY),
    rerollPolicy: getSetting(SETTINGS.REROLL_POLICY),
    enableHeroic: getSetting(SETTINGS.ENABLE_HEROIC) === true,
    enableVillainous: getSetting(SETTINGS.ENABLE_VILLAINOUS) === true
  };
}

/** Snapshot of the activation settings for the activation policy evaluator. */
export function getActivationSettings() {
  return {
    activationPolicy: getSetting(SETTINGS.ACTIVATION_POLICY),
    allowOutsideCombat: getSetting(SETTINGS.ALLOW_ABILITY_OUTSIDE_COMBAT) === true,
    requireGMApprovalForAutomation: getSetting(SETTINGS.REQUIRE_GM_APPROVAL_AUTOMATION) === true,
    playersCanUseManualWithoutApproval: getSetting(SETTINGS.PLAYERS_MANUAL_WITHOUT_APPROVAL) === true,
    legendaryUsesPerRound: Number(getSetting(SETTINGS.LEGENDARY_USES_PER_ROUND) ?? 1)
  };
}

/* -------------------------------------------- */

const L = key => `HVA.Settings.${key}`;

function register(key, data) {
  game.settings.register(MODULE_ID, key, {
    name: L(`${key}.Name`),
    hint: L(`${key}.Hint`),
    scope: "world",
    config: true,
    ...data
  });
}

/**
 * Register all settings and menus. Idempotent: skips keys already registered.
 * @param {object} menus
 * @param {typeof foundry.applications.api.ApplicationV2} [menus.GMManagement]
 * @param {typeof foundry.applications.api.ApplicationV2} [menus.SettingsHelp]
 */
export function registerSettings(menus={}) {
  const registered = game.settings.settings;
  if ( registered.has(`${MODULE_ID}.${SETTINGS.ENABLE_HEROIC}`) ) return;

  if ( menus.GMManagement ) {
    game.settings.registerMenu(MODULE_ID, "gmManagement", {
      name: L("Menu.GMManagement.Name"),
      label: L("Menu.GMManagement.Label"),
      hint: L("Menu.GMManagement.Hint"),
      icon: "fa-solid fa-crown",
      type: menus.GMManagement,
      restricted: true
    });
  }
  if ( menus.SettingsHelp ) {
    game.settings.registerMenu(MODULE_ID, "settingsHelp", {
      name: L("Menu.SettingsHelp.Name"),
      label: L("Menu.SettingsHelp.Label"),
      hint: L("Menu.SettingsHelp.Hint"),
      icon: "fa-solid fa-circle-question",
      type: menus.SettingsHelp,
      restricted: false
    });
  }

  // Resource generation
  register(SETTINGS.ENABLE_HEROIC, { type: Boolean, default: true });
  register(SETTINGS.ENABLE_VILLAINOUS, { type: Boolean, default: true });
  for ( const category of CATEGORY_KEYS ) {
    game.settings.register(MODULE_ID, categorySettingKey(category), {
      name: `HVA.Category.${category}.Name`,
      hint: `HVA.Category.${category}.Hint`,
      scope: "world",
      config: true,
      type: Boolean,
      default: DEFAULT_CATEGORY_STATE[category] ?? false
    });
  }
  register(SETTINGS.ADVANTAGE_POLICY, {
    type: String,
    default: ADVANTAGE_POLICIES.SELECTED,
    choices: {
      [ADVANTAGE_POLICIES.SELECTED]: L("advantagePolicy.Selected"),
      [ADVANTAGE_POLICIES.ANY]: L("advantagePolicy.Any"),
      [ADVANTAGE_POLICIES.ORDINARY_ONLY]: L("advantagePolicy.OrdinaryOnly")
    }
  });
  register(SETTINGS.REROLL_POLICY, {
    type: String,
    default: REROLL_POLICIES.FINAL,
    choices: {
      [REROLL_POLICIES.FINAL]: L("rerollPolicy.Final"),
      [REROLL_POLICIES.EXCLUDE_REROLLED]: L("rerollPolicy.ExcludeRerolled")
    }
  });
  register(SETTINGS.NPC_GENERATION, { type: Boolean, default: false });
  register(SETTINGS.COUNT_OUTSIDE_COMBAT, { type: Boolean, default: true });
  register(SETTINGS.CAP_BEHAVIOR, {
    type: String,
    default: CAP_BEHAVIORS.NOTIFY,
    choices: {
      [CAP_BEHAVIORS.NOTIFY]: L("capBehavior.Notify"),
      [CAP_BEHAVIORS.SILENT]: L("capBehavior.Silent")
    }
  });
  register(SETTINGS.NOTIFICATION_MODE, {
    type: String,
    default: NOTIFICATION_MODES.PUBLIC,
    choices: {
      [NOTIFICATION_MODES.PUBLIC]: L("notificationMode.Public"),
      [NOTIFICATION_MODES.PRIVATE]: L("notificationMode.Private"),
      [NOTIFICATION_MODES.NONE]: L("notificationMode.None")
    }
  });
  register(SETTINGS.SHOW_TOASTS, { scope: "client", type: Boolean, default: true });
  register(SETTINGS.SHOW_SHEET_CARD, { scope: "client", type: Boolean, default: true });

  // Ability activation
  register(SETTINGS.ACTIVATION_POLICY, {
    type: String,
    default: ACTIVATION_POLICIES.FLEXIBLE,
    choices: {
      [ACTIVATION_POLICIES.FLEXIBLE]: L("activationPolicy.Flexible"),
      [ACTIVATION_POLICIES.LEGENDARY]: L("activationPolicy.Legendary"),
      [ACTIVATION_POLICIES.TURN_BOUND]: L("activationPolicy.TurnBound"),
      [ACTIVATION_POLICIES.GM_CONTROLLED]: L("activationPolicy.GMControlled")
    }
  });
  register(SETTINGS.LEGENDARY_USES_PER_ROUND, {
    type: Number, default: 1, range: { min: 0, max: 6, step: 1 }
  });
  register(SETTINGS.ALLOW_ABILITY_OUTSIDE_COMBAT, { type: Boolean, default: true });
  register(SETTINGS.REQUIRE_GM_APPROVAL_AUTOMATION, { type: Boolean, default: true });
  register(SETTINGS.DEFAULT_COST, { type: Number, default: 1, range: { min: 1, max: 3, step: 1 } });
  register(SETTINGS.PLAYERS_CAN_EDIT, { type: Boolean, default: true });
  register(SETTINGS.PLAYERS_MANUAL_WITHOUT_APPROVAL, { type: Boolean, default: true });
  register(SETTINGS.REQUIRE_PUBLIC_CHAT, { type: Boolean, default: false });

  // Administration
  register(SETTINGS.ALLOW_ADMIN_OVERRIDE, { type: Boolean, default: false });
  register(SETTINGS.DIAGNOSTICS, { scope: "client", type: Boolean, default: false });
  game.settings.register(MODULE_ID, SETTINGS.SCHEMA_VERSION, {
    scope: "world", config: false, type: Number, default: 0
  });
}
