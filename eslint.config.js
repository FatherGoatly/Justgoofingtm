import globals from "globals";

const foundryGlobals = {
  foundry: "readonly",
  game: "readonly",
  ui: "readonly",
  canvas: "readonly",
  Hooks: "readonly",
  CONFIG: "readonly",
  CONST: "readonly",
  ChatMessage: "readonly",
  Actor: "readonly",
  Item: "readonly",
  Macro: "readonly",
  Scene: "readonly",
  Roll: "readonly",
  Handlebars: "readonly",
  fromUuid: "readonly",
  fromUuidSync: "readonly",
  getDocumentClass: "readonly",
  dnd5e: "readonly",
  MidiQOL: "readonly"
};

export default [
  {
    files: ["scripts/**/*.js", "curriculum/**/*.js", "tests/**/*.js", "tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, ...foundryGlobals }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error"
    }
  },
  {
    // Lesson files import the whole authoring palette; unused helpers are expected.
    files: ["curriculum/**/*.js"],
    rules: { "no-unused-vars": "off" }
  },
  {
    // The sandbox worker is the one place learner code is deliberately compiled. It runs inside a Web Worker
    // with no access to the Foundry page. See docs/security.md.
    files: ["scripts/workshop/sandbox-worker.js", "scripts/workshop/harness.js"],
    languageOptions: { globals: { ...globals.worker } },
    rules: { "no-new-func": "off" }
  }
];
