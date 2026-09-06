"use strict";

/**
 * Flat-config entrypoint ESLint 9 requires per package (`eslint` resolves
 * `eslint.config.js` relative to CWD, not via `package.json` `main`).
 * `packages/config/eslint/index.js` already builds the full rule set +
 * module-boundary zones from `module-deps.json` — this file only wires it
 * up for `apps/api` and adds the ignore patterns this package needs.
 *
 * Found missing during a full-repo lint sweep (2026-09-06) — `pnpm run
 * lint` at the workspace root had apparently never been run across every
 * package at once before; each package was always linted individually
 * (`pnpm --filter <pkg> run lint`), so this gap (present since whenever
 * this package was scaffolded, not introduced by anything recent) had
 * never actually surfaced. Mirrors `packages/server/eslint.config.js`
 * exactly — same monorepo layout, same needs.
 */
const baseConfig = require("@klickit/config/eslint");

module.exports = [{ ignores: ["dist/**", "node_modules/**"] }, ...baseConfig];
