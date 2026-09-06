"use strict";

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: process.cwd(),
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.spec.ts", "**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/**/*.test.ts",
    "!src/**/index.ts",
    "!src/migrations/**",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  clearMocks: true,
  restoreMocks: true,
  // Jest's built-in default is 5000ms for both `it()` bodies AND `beforeAll`/`afterAll` hooks.
  // That was never a problem before this suite ever ran against a real database: every
  // integration spec's `beforeAll` does a connectivity PROBE first and self-skips (fast,
  // well under 5s) whenever Postgres is unreachable. Found running the full suite for real
  // for the first time (Phase 5 Full Verification) — `AppDataSource.initialize()` legitimately
  // takes longer than 5s under ts-jest (parses all 34 migration files + ~140 entity files, then
  // opens a real TCP connection), so `licensing-e2e.integration.spec.ts`'s (and, by the same
  // mechanism, every one of the other 30 `*.integration.spec.ts` files') `beforeAll` hook timed
  // out at the default 5000ms; the resulting mid-flight Jest environment teardown then raced
  // typeorm's still-in-flight dynamic `import()` calls, producing a wall of unrelated
  // "trying to import a file after the Jest environment has been torn down" noise on top of the
  // real timeout. None of the 32 integration specs set a per-file/per-hook override (confirmed
  // via a repo-wide search for `jest.setTimeout`), so this is fixed once, here, for all of them
  // (and for any future integration spec) rather than patched 31 times.
  //
  // Bumped again 2026-09-06 (Slice 54, notifications pass): the same scaling problem recurred
  // at the next threshold — the migrations directory grew from 34 files (when 30000ms was
  // chosen) to 257, and `approvals.integration.spec.ts`'s `beforeAll` timed out at 30000ms
  // (confirmed via a manual re-run: it genuinely completes, just in ~62s, not stuck — the SAME
  // "parses every migration file" cost, just bigger now, not a new problem). All 36 files
  // calling `AppDataSource.initialize()` share this identical root cause, so this is fixed once
  // here again rather than in whichever specific file happens to flake next as the migrations
  // directory keeps growing. 90000ms gives real headroom (~1.5x the measured 62s) rather than
  // just barely clearing today's number, since this will keep climbing over the project's life.
  testTimeout: 90000,
};
