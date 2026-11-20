import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  // ESLint ignores node_modules/ and .git/ by default.
  globalIgnores(["dist/", "test/fixture-app/", "test-results/", "playwright-report/", ".auth/"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  // Config files and build scripts run in Node.
  { files: ["**/*.mjs"], languageOptions: { globals: globals.node } },
  // Last: switches off the rules that conflict with Prettier.
  prettier
);
