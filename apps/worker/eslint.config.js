"use strict";

/**
 * Flat-config entrypoint ESLint 9 requires per package (`eslint` resolves
 * `eslint.config.js` relative to CWD, not via `package.json` `main`).
 * `packages/config/eslint/index.js` already builds the full rule set +
 * module-boundary zones from `module-deps.json` — this file only wires it
 * up for `apps/worker` and adds the ignore patterns this package needs.
 *
 * Found missing during a full-repo lint sweep (2026-09-06) — see
 * `apps/api/eslint.config.js`'s identical doc comment for the full
 * "never run at the workspace root before" context. Mirrors
 * `packages/server/eslint.config.js` exactly.
 */
const baseConfig = require("@klickit/config/eslint");

module.exports = [{ ignores: ["dist/**", "node_modules/**"] }, ...baseConfig];
