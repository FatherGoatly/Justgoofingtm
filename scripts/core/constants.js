/**
 * Shared identifiers for the Game Master's Macro Academy.
 * This file has no Foundry dependencies so it can be imported by engines, tests and tooling alike.
 */

export const MODULE_ID = "gm-macro-academy";
export const MODULE_TITLE = "The Game Master's Macro Academy";

/** Version of the progress record schema. Bump when scripts/progress/migrations.js gains a step. */
export const PROGRESS_SCHEMA_VERSION = 1;

/** Version of the curriculum data model. Bump when lesson schema changes in a way migrations must know about. */
export const CURRICULUM_SCHEMA_VERSION = 1;

/** Keys for settings registered under the module namespace. */
export const SETTINGS = Object.freeze({
  // World (GM-controlled)
  ACCESS: "access",                       // "gm" | "all"
  PLAYER_LIVE_EXECUTION: "playerLiveExecution",
  SHOW_SYSTEM_LESSONS: "showSystemLessons",
  // User (personal preferences, stored server-side per user)
  DEFAULT_MODE: "defaultMode",            // "guided" | "workshop" | "challenge"
  EDITOR_FONT_SIZE: "editorFontSize",
  REQUIRE_ASSESSMENT: "requireAssessment",
  RECORD_ASSISTED: "recordAssisted",
  NOTIFICATIONS: "notifications",
  OPEN_BEHAVIOR: "openBehavior",          // "dashboard" | "resume"
  EXPORT_PROJECTS: "exportIncludesProjects",
  LIVE_WARNING_MODE: "liveWarningMode",   // "always" | "session"
  // User data (never shown in the settings form)
  PROGRESS: "progress",
  DRAFTS: "drafts",
  // Client
  WINDOW_STATE: "windowState"
});

export const ACCESS_MODES = Object.freeze({ GM: "gm", ALL: "all" });
export const LEARNING_MODES = Object.freeze({ GUIDED: "guided", WORKSHOP: "workshop", CHALLENGE: "challenge" });
export const OPEN_BEHAVIORS = Object.freeze({ DASHBOARD: "dashboard", RESUME: "resume" });
export const LIVE_WARNING_MODES = Object.freeze({ ALWAYS: "always", SESSION: "session" });

/** Flag keys written to documents created by the academy (fixtures, exported macros). */
export const FLAGS = Object.freeze({
  FIXTURE: "fixture",
  FIXTURE_SET: "fixtureSet",
  DRAFT_ID: "draftId",
  EXPORTED_AT: "exportedAt"
});

/** Lesson learning states. See docs/architecture.md#mastery. */
export const LESSON_STATES = Object.freeze({
  LOCKED: "locked",
  NOT_STARTED: "not-started",
  IN_PROGRESS: "in-progress",
  COMPLETED_GUIDED: "completed-guided",
  COMPLETED_INDEPENDENT: "completed-independent",
  MASTERED: "mastered",
  NEEDS_REVIEW: "needs-review"
});

export const COMPLETED_STATES = Object.freeze([
  LESSON_STATES.COMPLETED_GUIDED,
  LESSON_STATES.COMPLETED_INDEPENDENT,
  LESSON_STATES.MASTERED
]);

/** Execution environments offered by the workshop. */
export const EXECUTION_MODES = Object.freeze({
  SANDBOX: "sandbox",     // Web Worker, no Foundry access
  PREVIEW: "preview",     // Web Worker, emulated Foundry built from a read-only snapshot
  LIVE: "live"            // Main thread, real Foundry API, explicit confirmation required
});

/** Curriculum categories used for filtering. */
export const CATEGORIES = Object.freeze({
  CORE_JS: "core-js",
  CORE_FOUNDRY: "core-foundry",
  SYSTEM: "system",
  MODULE: "module",
  DEBUGGING: "debugging",
  INTEGRATION: "integration",
  PROJECT: "project"
});

export const DIFFICULTIES = Object.freeze(["beginner", "intermediate", "advanced", "expert"]);

/** Limits that keep user-scoped storage small. */
export const LIMITS = Object.freeze({
  MAX_DRAFTS: 60,
  MAX_DRAFT_BYTES: 64 * 1024,
  MAX_TOTAL_DRAFT_BYTES: 1.5 * 1024 * 1024,
  MAX_DRAFT_VERSIONS: 10,
  MAX_ACTIVITY_ENTRIES: 200,
  MAX_ATTEMPTS_PER_EXERCISE: 50,
  SANDBOX_TIMEOUT_MS: 4000,
  SNAPSHOT_MAX_BYTES: 2 * 1024 * 1024
});
