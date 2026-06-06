// ESLint flat config (ESLint v9+).
//
// Combines two rule sets:
//   1. typescript-eslint's recommended rules plus the project's own overrides
//      (migrated from the former .eslintrc).
//   2. eslint-plugin-obsidianmd's recommended set — the official Obsidian
//      plugin-reviewer rules, including no-unsupported-api which flags use of
//      Obsidian APIs newer than manifest.json's minAppVersion.
//
// The obsidianmd rules are type-aware, so the TS files are linted with type
// information via parserOptions.project.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  {
    // Build output and deps are never linted.
    ignores: ["main.js", "dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Overrides carried over from the previous .eslintrc.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "no-prototype-builtins": "off",
      "@typescript-eslint/no-empty-function": "off",
      // We deliberately use the deprecated display() instead of the 1.13.0
      // getSettingDefinitions() API, which would exceed manifest minAppVersion.
      "@typescript-eslint/no-deprecated": "off",
    },
  },
);
