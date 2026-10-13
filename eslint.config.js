import globals from "globals";

export default [
  {
    files: ["scripts/**/*.js", "tests/**/*.js", "tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        foundry: "readonly",
        game: "readonly",
        ui: "readonly",
        canvas: "readonly",
        Hooks: "readonly",
        CONFIG: "readonly",
        CONST: "readonly",
        ChatMessage: "readonly",
        Actor: "readonly",
        Roll: "readonly",
        Handlebars: "readonly",
        fromUuid: "readonly",
        fromUuidSync: "readonly",
        getDocumentClass: "readonly",
        dnd5e: "readonly",
        MidiQOL: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error"
    }
  }
];
