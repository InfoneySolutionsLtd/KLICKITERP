"use strict";

/**
 * Flat-config entrypoint ESLint 9 requires per package (`eslint` resolves
 * `eslint.config.js` relative to CWD, not via `package.json` `main`).
 * `packages/config/eslint/index.js` already builds the full rule set +
 * module-boundary zones from `module-deps.json` — this file only wires it
 * up for `packages/contracts` and adds the ignore patterns this package
 * needs.
 *
 * Found missing during a full-repo lint sweep (2026-09-06) — see
 * `apps/api/eslint.config.js`'s identical doc comment for the full
 * "never run at the workspace root before" context. `src/generated/**`
 * (openapi-typescript's own output) and every `*.schema.ts` file under
 * `src/**` (this package's own zod-schema codegen output — see each file's
 * own "AUTO-GENERATED... DO NOT EDIT BY HAND" header) are excluded — hand
 * fixing lint findings in machine-generated code that gets fully
 * overwritten on the next `generate:types`/`generate:zod` run would be
 * pointless; the codegen scripts themselves (`scripts/`, `codegen/`) are
 * real, lintable source, not excluded here.
 */
const baseConfig = require("@klickit/config/eslint");

module.exports = [
  { ignores: ["dist/**", "node_modules/**", "src/generated/**", "src/**/*.schema.ts"] },
  ...baseConfig,
];
