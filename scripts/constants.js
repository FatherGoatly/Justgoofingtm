/**
 * Shared constants for the Heroic & Villainous Actions module.
 * This file must stay free of Foundry globals so it can be imported by unit tests.
 */

export const MODULE_ID = "heroic-villainous-actions";
export const MODULE_TITLE = "Heroic & Villainous Actions";
export const FLAG_SCOPE = MODULE_ID;
export const SOCKET_NAME = `module.${MODULE_ID}`;

/** Version of the persistent actor flag schema. Bump when the stored structure changes. */
export const SCHEMA_VERSION = 1;

/** Hard maximum of each resource pool (the game rule). */
export const MAX_PER_POOL = 3;

/** Number of history entries retained per actor. */
export const HISTORY_LIMIT = 40;

/** Text limits applied to player-defined ability text. */
export const TEXT_LIMITS = Object.freeze({
  name: 80,
  description: 2000,
  shortField: 200,
  formula: 60
});

export const POOLS = Object.freeze({
  HEROIC: "heroic",
  VILLAINOUS: "villainous"
});

export const POOL_LIST = Object.freeze([POOLS.HEROIC, POOLS.VILLAINOUS]);

/** Natural die faces that generate resources. */
export const NATURAL_TRIGGERS = Object.freeze({
  [POOLS.HEROIC]: 20,
  [POOLS.VILLAINOUS]: 1
});

/** Qualifying roll categories. Keys are used in settings and diagnostics. */
export const ROLL_CATEGORIES = Object.freeze({
  ATTACK: "attack",
  ABILITY_CHECK: "abilityCheck",
  SKILL_CHECK: "skillCheck",
  TOOL_CHECK: "toolCheck",
  SAVING_THROW: "savingThrow",
  DEATH_SAVE: "deathSave",
  CONCENTRATION: "concentration",
  INITIATIVE: "initiative",
  UNKNOWN: "unknown"
});

/** Default enabled state of each category. */
export const DEFAULT_CATEGORY_STATE = Object.freeze({
  [ROLL_CATEGORIES.ATTACK]: true,
  [ROLL_CATEGORIES.ABILITY_CHECK]: true,
  [ROLL_CATEGORIES.SKILL_CHECK]: true,
  [ROLL_CATEGORIES.TOOL_CHECK]: true,
  [ROLL_CATEGORIES.SAVING_THROW]: true,
  [ROLL_CATEGORIES.DEATH_SAVE]: false,
  [ROLL_CATEGORIES.CONCENTRATION]: true,
  [ROLL_CATEGORIES.INITIATIVE]: false
});

export const ADVANTAGE_POLICIES = Object.freeze({
  SELECTED: "selected",
  ANY: "any",
  ORDINARY_ONLY: "ordinaryOnly"
});

export const REROLL_POLICIES = Object.freeze({
  FINAL: "final",
  EXCLUDE_REROLLED: "excludeRerolled"
});

export const CAP_BEHAVIORS = Object.freeze({
  NOTIFY: "notify",
  SILENT: "silent"
});

export const NOTIFICATION_MODES = Object.freeze({
  PUBLIC: "public",
  PRIVATE: "private",
  NONE: "none"
});

export const ACTIVATION_POLICIES = Object.freeze({
  FLEXIBLE: "flexible",
  LEGENDARY: "legendary",
  TURN_BOUND: "turnBound",
  GM_CONTROLLED: "gmControlled"
});

export const ABILITY_MODES = Object.freeze({
  MANUAL: "manual",
  AUTOMATED: "automated"
});

export const ACTIVATION_TYPES = Object.freeze(["action", "bonus", "reaction", "free", "special"]);

/** Activation types that are permitted outside the character's own turn under restrictive policies. */
export const OFF_TURN_ACTIVATION_TYPES = Object.freeze(["reaction", "special"]);

export const APPROVAL_STATES = Object.freeze({
  NOT_REQUIRED: "notRequired",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
});

/** Structured mechanic types the executor knows how to run with trusted module-owned code. */
export const MECHANIC_TYPES = Object.freeze({
  DAMAGE: "damage",
  HEAL: "heal",
  TEMP_HP: "tempHp",
  SAVE: "save",
  CHECK: "check",
  APPLY_CONDITION: "applyCondition",
  REMOVE_CONDITION: "removeCondition",
  TEMPLATE: "template",
  PROMPT: "prompt",
  NOTE: "note"
});

export const MECHANIC_TYPE_LIST = Object.freeze(Object.values(MECHANIC_TYPES));

/** Mechanics that act directly on targeted tokens. */
export const TARGETED_MECHANICS = Object.freeze([
  MECHANIC_TYPES.HEAL,
  MECHANIC_TYPES.TEMP_HP,
  MECHANIC_TYPES.APPLY_CONDITION,
  MECHANIC_TYPES.REMOVE_CONDITION
]);

export const TEMPLATE_TYPES = Object.freeze(["circle", "cone", "rect", "ray"]);

export const HISTORY_KINDS = Object.freeze({
  AWARD: "award",
  BLOCKED: "blocked",
  SPEND: "spend",
  REFUND: "refund",
  ADJUST: "adjust",
  RESET: "reset",
  OVERRIDE: "override"
});

export const SOCKET_ACTIONS = Object.freeze({
  AWARD_REQUEST: "awardRequest",
  ACTIVATION_APPROVAL_REQUEST: "activationApprovalRequest",
  ACTIVATION_APPROVAL_RESPONSE: "activationApprovalResponse",
  APPLY_TO_TARGET: "applyToTarget"
});
