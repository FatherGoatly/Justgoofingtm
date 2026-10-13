import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "dist/**", "coverage/**"] },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        foundry: "readonly",
        game: "readonly",
        CONFIG: "readonly",
        CONST: "readonly",
        Hooks: "readonly",
        ui: "readonly",
        canvas: "readonly",
        Actor: "readonly",
        Item: "readonly",
        Macro: "readonly",
        ActiveEffect: "readonly",
        ChatMessage: "readonly",
        Folder: "readonly",
        Roll: "readonly",
        fromUuid: "readonly",
        fromUuidSync: "readonly",
        getDocumentClass: "readonly",
        Handlebars: "readonly",
        dnd5e: "readonly",
        MidiQOL: "readonly",
        DAE: "readonly"
      }
    },
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/indent": ["warn", 2, { SwitchCase: 1 }],
      "@stylistic/quotes": ["warn", "double", { avoidEscape: true, allowTemplateLiterals: "always" }],
      "@stylistic/semi": ["warn", "always"],
      "@stylistic/comma-dangle": ["warn", "never"],
      "@stylistic/eol-last": ["error", "always"],
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-undef": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "eqeqeq": ["warn", "smart"],
      "prefer-const": "warn",
      "no-var": "error"
    }
  }
];
