# Klickit Finance ERP — Developer Documentation

This document is the single entry point for a developer joining this codebase. It explains what the
system is, how it is put together, the conventions that keep 21+ backend modules and a large Next.js
frontend coherent, and the operational rules that have been learned (sometimes the hard way) while
building it. It does not replace the deeper documents under `docs/` — it orients you and tells you
where to look next.

> Deeper source-of-truth documents live under `docs/`: `docs/phase-1/SRS.md` (requirements),
> `docs/phase-2/*` (functional/non-functional requirements, business rules, use cases, acceptance
> criteria), `docs/phase-3/*` (architecture, communication/auth, deployment), `docs/phase-4/*`
> (DB standards and full schema), `docs/phase-5/*` and `docs/phase-6/PROGRESS.md` (module-by-module and
> slice-by-slice build logs — the most detailed record of *why* things are the way they are). This file
> is the map; those are the territory.

---

## 1. What this system is

Klickit Finance ERP is a **single-tenant school finance/ERP system** — one deployment per school,
covering the full financial lifecycle: student billing, payments (cash/bank/M-Pesa), a student wallet,
procurement, inventory, expenses, payroll, banking/reconciliation, fixed assets, full double-entry
accounting (GL), reporting, third-party integrations, backups, and a generic approvals/notifications
layer that ties them together. A separate, structurally isolated licensing module governs activation
against Infoney's own Super Admin portal.

Design priorities, in order, per `docs/phase-3/01-system-architecture.md`:

1. **Financial integrity** — every money mutation is one ACID transaction through a single posting
   choke point.
2. **Runs on modest school hardware**, operated by one non-specialist admin per school.
3. **Offline-tolerant** — core function needs no internet; integrations queue and retry.
4. **Strict module boundaries**, mechanically enforced (see §4).
5. **10-year data horizon, auditability, immutability.**

## 2. Tech stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js ≥ 22, NestJS 11, TypeScript 5.7 |
| ORM / DB | TypeORM 0.3, PostgreSQL 16 |
| Queues / cache | Redis 7, BullMQ |
| Object storage | MinIO (S3-compatible) |
| Frontend | Next.js 15 (App Router), React 19, TanStack Query 5, Tailwind CSS 3, shadcn/ui, Zustand, next-intl |
| API contract | OpenAPI (NestJS Swagger) → generated TS types + typed `openapi-fetch` client + generated zod DTO mirrors |
| Monorepo tooling | pnpm workspaces + Turborepo |
| Testing | Jest (unit + real-DataSource integration tests), ts-jest |

## 3. Repository layout

```
klickit-finance-erp/
├── apps/
│   ├── api/        # NestJS HTTP API composition root (port 3000)
│   ├── worker/      # NestJS BullMQ processors + cron composition root (port 3001, health-only HTTP)
│   └── web/         # Next.js 15 App Router frontend (port 3002)
├── packages/
│   ├── server/      # @klickit/server — ALL backend business logic, consumed via dist/index.js
│   ├── contracts/   # @klickit/contracts — OpenAPI types + typed client + generated zod schemas
│   └── config/      # @klickit/config — shared eslint/jest/tsconfig bases + module-deps.json
├── tools/           # @klickit/tools — one-shot admin bootstrap script
└── docs/            # phase-1..6 requirements/architecture/schema/progress documents
```

Root `package.json` scripts (`build`/`test`/`lint`/`typecheck`) all delegate to `turbo run <name>`,
which fans out to every workspace package's own script of the same name. `tools` only has
`typecheck` (no `build`/`test`/`lint`).

**Critical, easy-to-forget fact:** `packages/server` and `packages/contracts` both declare
`"main": "dist/index.js"`. Every consumer (`apps/api`, `apps/worker`, `apps/web`) resolves the
**pre-built `dist/`**, not live TypeScript source, and this monorepo has **no dev-mode watch/rebuild
pipeline**. After changing anything under `packages/server/src` or `packages/contracts/src`, you must
run `pnpm --filter @klickit/server run build` (or `@klickit/contracts`) **before** restarting whatever
consumes it — otherwise the consumer keeps running silently stale logic with zero compile or runtime
error to warn you.

## 4. Backend architecture

### 4.1 Modular monolith, not microservices

One NestJS application, internally partitioned into strictly-bounded modules, deployed as **two**
runtime processes sharing one codebase, one Postgres database, one Redis instance:

- `apps/api` — `main.api.ts`, the HTTP API (+ WebSocket).
- `apps/worker` — `main.worker.ts`, BullMQ processors + cron jobs (bulk billing, comms, M-Pesa polling,
  payroll, reports, backups). Exposes only a health endpoint over HTTP.

This split exists so a heavy background job (bulk billing, payroll run, report generation) can never
degrade interactive latency for someone at a counter — the one scaling need the load profile actually
demands (ADR-003). Everything else about microservices — independent deployability, per-service DBs,
distributed transactions — is deliberately rejected: it would break the single-ACID-transaction
guarantee financial postings require (ADR-001), for no benefit at this deployment scale (one Postgres
per school, capped around 10k students).

`apps/web` is a fully separate deployable, consuming the API exclusively over `/api/v1` (ADR-004) — the
frontend is "customer zero" of the public API, not a privileged internal client.

### 4.2 Module map

Backend source lives entirely in `packages/server/src`, organized into four kinds of module root
(see `packages/config/eslint/module-deps.json`, the machine-readable source of truth for all of this):

```
shared/          shared kernel — money, ids, audit, events, rbac, database base entity, pagination,
                 crypto, cache, infra (importable by everyone; imports nothing itself)

platform/        cross-cutting platform modules:
  auth  users  settings  files  branding  comms
  approvals  document-verification  notifications

accounting/      accounting core — the ONLY writer of the general ledger

domains/         business/domain modules:
  students  billing  payments  wallet  procurement  inventory
  expenses  payroll  banking  fixed-assets  reporting
  integrations  backups-ops

licensing/       structurally isolated — imports shared-kernel ONLY, own Postgres schema (`license.*`)
                 and own DB role, no other module may reach into it
```

These correspond to the 21 numbered modules from the phase-5 build plan (`docs/phase-5/00-module-plan.md`),
plus two later platform additions built in Phase 6: `document-verification` (QR/watermark document
verification) and `notifications` (the generic in-app notification inbox). `apps/api/src/app.module.ts`
imports all of them at the composition root, in module-number order, alongside a root
`TypeOrmModule.forRoot()` and two global providers (`AllExceptionsFilter`, a `ValidationPipe` that
flattens class-validator errors into `{field, message}[]`).

### 4.3 Module dependency rules (mechanically enforced)

Default rule: a platform or domain module may import **shared-kernel only**. Every exception —
"domain X may also import platform Y because of a real FK or a real service call" — is an explicit,
individually-documented entry in `packages/config/eslint/module-deps.json`, consumed by a custom
ESLint `import/no-restricted-paths` rule builder (`packages/config/eslint/index.js`). An import that
isn't declared there **fails the lint build**, not just code review.

Practical implications for adding code:

- Domain modules never import each other's **repositories** directly. Cross-domain interaction goes
  through the other module's exported **service**, imported via its `index.ts` barrel
  (e.g. `payments` calls `WalletService`, never touches `wall_*` tables itself).
- A handful of domain pairs are **bidirectionally entity-linked** (e.g. `students`↔`billing`,
  `payments`↔`wallet`, `procurement`↔`banking`) because their schemas have real mutual foreign keys.
  In every such case the import is of the **specific entity file** (e.g.
  `../../billing/domain/bill-sponsor.entity`), never the sibling's barrel/`*.module.ts` — importing a
  module's barrel eagerly pulls in its controllers/services (NestJS needs the entity class value
  eagerly for `@InjectRepository()`), which turns a narrow FK-level relationship into a real
  circular-dependency crash at boot. This is a load-bearing, previously-hit-for-real convention — do
  not "clean up" a direct entity-file import into a barrel import.
- Accounting core (`accounting/`) is the **sole writer of the general ledger**. A domain module never
  writes `gl_*` tables directly; it calls `PostingService.post(journalDraft, em)` inside its own
  transaction. A database trigger rejects any `gl_*` write that didn't come through that path — defense
  in depth, not just a code-review rule.
- `licensing/` has no exceptions at all, in either direction: nothing else may import it, and it may
  import nothing but shared-kernel. This is deliberate structural isolation (the licensing/activation
  surface must never be able to see financial data), not an oversight.
- New cross-module dependency? Add a documented entry to `module-deps.json` following the existing
  style (name the real FK or the real service call, name the concrete method, explain why it isn't a
  cycle) before writing the import — this file is treated as living documentation, not boilerplate.

### 4.4 Anatomy of a backend module

Every module under `platform/` or `domains/` follows the same internal shape:

```
domains/billing/
├── billing.module.ts        # Nest module; exports ONLY its public service(s) + events
├── api/
│   ├── *.controller.ts      # thin — DTO in, service call, DTO out; @ApiTags for Swagger
│   └── dto/                 # class-validator DTOs (zod mirror auto-generated into contracts/)
├── application/              # use-case services — the transaction owners
├── domain/                   # TypeORM entities + pure business rules/state machines
├── infrastructure/            # repositories — the ONLY code touching this module's own tables
├── jobs/                      # BullMQ processors (run in the worker) + cron
├── events/                    # published + subscribed domain events
└── __tests__/                 # unit + integration, co-located
```

Layering rule: controllers never touch repositories directly; services own transactions (via the
shared `tx()` helper / injected `EntityManager`) and compose repositories + cross-module service calls
+ posting inside that one transaction.

### 4.5 Standard entity pattern

Every table gets, via `shared/database/base.entity.ts`:

- `id` — UUIDv7 primary key.
- `created_at` / `updated_at`.
- `created_by` / `updated_by`.

Mutable (updatable) tables additionally extend `MutableBaseEntity` for a `version int` column
(optimistic locking). Table names are prefixed by module concern via a TypeORM naming strategy —
e.g. `bill_invoice`, `pay_receipt`, `gl_journal_line`, `usr_user`, `appr_instance`, `ntf_notification`.
Some recognizable prefixes: `usr_` (users/auth), `appr_` (approvals), `bill_` (billing), `pay_`
(payments), `wall_`/`wallet` (wallet — see `wall_wallet`), `proc_` (procurement), `inv_` (inventory),
`exp_` (expenses), `pyrl_` (payroll), `bank_` (banking), `fa_` (fixed assets), `gl_`/`glr_`
(accounting/GL), `set_` (settings), `comm_` (comms), `docv_` (document verification), `ntf_`
(notifications), `intg_` (integrations), `bkp_` (backups), `brnd_` (branding), `obx_` (outbox).

### 4.6 Migrations

Numbered, ordered, reversible files under `packages/server/src/migrations/` (currently up to
`0256`, though not every number in the range is used — numbers are allocated in blocks per
module/feature, not strictly sequential by file count). A special `0900-seed-permissions-and-roles.ts`
always runs last regardless of the highest numbered migration, since it seeds permission/role data that
depends on every other table already existing.

**A gotcha that has bitten this codebase twice:** `packages/server/src/migrations/data-source.ts`
holds its own, separate, authoritative `entities: [...]` array — the one `TypeOrmModule.forRoot()`
actually reads at boot (see `apps/api/src/app.module.ts`'s own doc comment). Registering a new entity
only via its own module's `TypeOrmModule.forFeature([...])` compiles and boots fine, then throws
`No metadata for "X" was found` the moment a real query touches it. **Every new entity must also be
added to `migrations/data-source.ts`'s own array.**

Two DB roles, matching the DDL/DML split:

- `kfe_app` — runtime role, DML-only (`SELECT`/`INSERT`/`UPDATE`/`DELETE`). Used by `apps/api` and
  `apps/worker` at boot (`DB_USER`/`DB_PASSWORD`).
- `kfe_migrate` — migration role, DDL-only. Used only by `pnpm migration:run`/`migration:revert`, never
  at app boot (`DB_MIGRATION_USER`/`DB_MIGRATION_PASSWORD`).

New tables automatically get full DML granted to `kfe_app` via migration `0002`'s
`ALTER DEFAULT PRIVILEGES` rule — no per-table `GRANT` needed for a brand-new table (only needed
historically for tables that predated that rule).

### 4.7 Cross-cutting mechanisms

| Mechanism | How it works |
|---|---|
| **Posting choke point** | `PostingService.post(journalDraft, em)` is the only code path that ever writes `gl_journal`/`gl_journal_line`. It validates balance/period/account rules, allocates a gapless journal number via `NumberingService` (row-locked), and writes atomically inside the caller's transaction. A DB trigger rejects any other writer. Posting maps per domain are named `P-00`…`P-35`-style codes (e.g. P-13 wallet top-up, P-18 GRN receipt, P-27/P-28 payroll net-pay/statutory) — see each domain's own `*-posting-maps.ts`/`gl-*-accounts.util.ts` for the mapping. |
| **Transactions** | A shared `tx(async em => {...})` helper wraps a TypeORM `EntityManager`; services compose repositories + posting inside one transaction. Hot rows (wallet balance, numbering counters, cashier sessions) use `SELECT … FOR UPDATE`. |
| **Domain events + outbox** | Events are written to an outbox table (`obx_outbox`) inside the same business transaction; a post-commit dispatcher (in the worker) delivers them at-least-once to in-process handlers / BullMQ. Handlers must be idempotent. |
| **Audit** | An interceptor + subscriber pair capture mutations with before/after diffs into a hash-chained audit log; payroll amounts are additionally envelope-encrypted. |
| **RBAC** | `@RequirePermission('billing:invoice:void')`-style decorators, checked by a guard against a Redis-cached permission set (busted on role change). Separation-of-duties / authority-limit checks live in a shared `AuthorityService`. |
| **Approval engine** | A generic, domain-code-keyed engine (`platform/approvals`, `ApprovalEngineService`) — `submit()` / `decide()` / `cancel()` / `listPendingForApprover()`. Routing/level resolution (who can approve at the current level) is **re-derived at both submit and decide time**, never persisted — so a role/routing-rule change takes effect immediately for in-flight requests. Levels can be `ROLE`, `USERS`, or `DEPT_HEAD` type. **BR-APPR-01** ("an initiator can never approve their own request") is enforced at three layers: the service logic, the notification-exclusion logic, and a real DB trigger (`trg_appr_no_self_approval`) — defense in depth, not trust in any single layer. Any domain module wanting an approval step calls `ApprovalEngineService.submit()`/`getStatus()` inside its own transaction with a `domainCode` (e.g. `BILLING_CONCESSION`, `PAYROLL_RUN`, `STOCK_ADJUSTMENTS`) — see `platform/approvals`'s `module-deps.json` entry for the full, current list of emitters. |
| **Notifications** | A generic, per-user notification inbox (`platform/notifications`, migration `0256`). `NotifyService.notify(input, manager?)` is the module's entire public surface. `type` is a deliberately unconstrained `varchar` (no DB CHECK) so any future emitter can introduce a brand-new notification type with zero migration. `platform/approvals` is the first real emitter — it raises `APPROVAL_PENDING` (to the relevant approver(s), on submit and on level-advance) and `APPROVAL_APPROVED`/`APPROVAL_REJECTED`/`APPROVAL_RETURNED` (to the initiator, on a terminal decision), always inside the same transaction as the state change that caused it. Any future module can call the same `notify()` without changing this module at all. |
| **Validation** | Three layers, deliberately redundant: class-validator DTOs at the API edge, zod mirrors of the same DTOs on the frontend (auto-generated, see §5.3), domain invariants inside services, and CHECK/FK/UNIQUE constraints at the database. |
| **Error model** | A global exception filter maps domain exceptions to a stable error envelope; a `request_id` correlates logs end-to-end. |
| **i18n** | Backend messages use message keys; the frontend has three ICU-style locale catalogs (`en`/`fr`/`sw`, kept in strict key-parity — see §6.4). |

## 5. Frontend architecture (`apps/web`)

Next.js 15, App Router, React 19. Route groups:

- `(auth)/` — public, unauthenticated: `login`, `forgot-password`, `reset-password`, `change-password`.
- `(erp)/` — the staff application, one top-level folder per domain module (`billing/`, `payments/`,
  `payroll/`, `banking/`, `accounting/`, `fixed-assets/`, `reports/`, `approvals/`, `settings/`,
  `students/`, `users/`, `roles/`, `departments/`, `wallet/`, `procurement/`, `inventory/`,
  `expenses/`, `communications/`, `branding/`, `files/`, `license/`, `ops/`, `notifications/`,
  `my-devices/`, `dashboard/`), each with the sub-routes for that module's own list/detail/create
  screens.
- `api/` — a small number of Next.js route handlers (`auth/session`, `auth/refresh`, `auth/logout`,
  `theme`) — not the real backend API, just thin session/cookie glue in front of it.
- `verify/[token]` — the public, unauthenticated document-verification landing page (QR code scans).

### 5.1 Feature-first organization

Business logic for a given backend module lives under `apps/web/src/features/<module>/` (`api/`,
`hooks/`, `components/`, `schemas/` as needed), separate from the route files under `app/`, which stay
thin (composition + `loading.tsx`/`error.tsx`/permission gates). This mirrors the backend module list
almost 1:1 (`features/billing`, `features/payments`, `features/approvals`, `features/notifications`,
etc.).

### 5.2 Shared UI conventions

- **`QueryBoundary`** (`components/patterns/query-boundary.tsx`) is the shared state machine
  (loading / error / permission-denied / offline / empty / populated) used by nearly every list page.
  Its `resolveQueryBoundaryState()` deliberately keys off TanStack Query's `isPending`, not
  `isLoading`.
- **`unwrapApiResult<T>()`** (`lib/api-error.ts`) must wrap every `openapi-fetch` call — it throws a
  typed `ApiError` (carrying the real HTTP status/code/details) on a non-2xx response. It must be
  called even when the caller discards the response body; skipping it silently swallows real errors.
- **`RowActionButton`** (`components/ui/row-action-button.tsx`) is the standard icon-only, gradient
  "illuminated" badge used for table row actions (view/edit/delete), rolled out app-wide. `tone`
  drives the gradient/glow.
- Zustand + `persist` middleware is used for pure client-side UI preference only (e.g.
  `lib/sidebar-store.ts`, collapsed/expanded state) — contrast with `lib/auth-store.ts`, which
  deliberately never touches any storage, for security.

### 5.3 Contracts codegen — the frontend/backend contract

`packages/contracts` is generated, not hand-written:

```
pnpm --filter contracts run generate:types   # openapi-typescript reads packages/contracts/openapi.json
pnpm --filter contracts run generate:zod     # scans packages/server's own class-validator DTOs,
                                              # writes ~200 *.schema.ts files, all marked
                                              # "AUTO-GENERATED ... DO NOT EDIT BY HAND"
pnpm --filter contracts run generate         # both, in order
```

`packages/contracts/openapi.json` is a **committed snapshot**, not fetched live at build time — refresh
it manually against a running, up-to-date `apps/api`:

```
curl http://localhost:3000/api/docs-json -o packages/contracts/openapi.json
```

`apps/web` consumes the generated types + a typed `openapi-fetch` client, so a backend DTO change that
isn't reflected in a refreshed `openapi.json`/regenerated contracts will not show up as a frontend type
error until you actually regenerate — don't assume the frontend "would have caught it."

### 5.4 A real, systemic CSS limitation — read before using Tailwind opacity modifiers

This app's brand/semantic color tokens (`--color-primary`, `--color-dark`, `--muted-foreground`, etc.)
are raw `var(--x)` CSS custom properties, **not** the `rgb(var(--x) / <alpha-value>)` pattern Tailwind's
`/NN` opacity-modifier syntax requires. Using `bg-brand-dark/90` (or any `/NN` suffix) on one of these
tokens **silently generates no CSS rule at all** — confirmed by inspecting compiled output, not merely
"the opacity is ignored." The established workaround everywhere in this codebase is:

```
bg-[color-mix(in_srgb,var(--color-dark)_92%,transparent)]
```

Literal Tailwind built-in colors (`white`, `black`) are unaffected and support `/NN` normally (e.g.
`bg-white/70` is fine). This has been rediscovered and fixed multiple times (sidebar background, header
divider, login card background) — check for this pattern before introducing a new `/NN` modifier on any
`--color-*`/brand/semantic token.

### 5.5 i18n discipline

Three locale files, `apps/web/src/i18n/messages/{en,fr,sw}.json` (currently ~7,300 keys each, via
`next-intl`). **Every key added to `en.json` must also be added to `fr.json` and `sw.json`** — even if
the fr/sw value is just the same English text for now, since translation isn't the current focus. After
any i18n change, verify with a small inline script computing the full flattened key-set diff across all
three files (zero missing/extra in either direction). Do not let a PR merge with three files out of
sync.

## 6. Development workflow

### 6.1 Prerequisites

Node ≥ 22, pnpm 11.13 (`packageManager` pinned in root `package.json`), a local PostgreSQL 16 with two
roles (`kfe_app`, `kfe_migrate`) and two databases/schemas (`app`, `license`), Redis 7, and (optionally,
for file uploads) a MinIO instance.

### 6.2 Environment

Copy `.env.example` to `.env` at the repo root and fill in real values — never commit the real `.env`.
Notable groups (see the file's own comments for the full, current list): core (`NODE_ENV`, `PORT`,
`WEB_APP_URL`), worker (`WORKER_PORT`, outbox poll cadence), database (both role credential pairs),
Redis, security (`JWT_KEY_CURRENT`/`JWT_KEY_PREVIOUS` — ES256 keypairs with a rotation overlap window,
`APP_ENCRYPTION_KEY`), storage (MinIO), integrations (admin alert email), backups
(`BACKUP_PASSPHRASE`, local/MinIO destinations), and licensing (Ed25519 keypairs — see
`docs/phase-3/02-communication-authentication.md` §2.6). Runtime-changeable configuration that isn't
infrastructure-level (e.g. the offsite S3 backup target) lives in the DB via the generic Settings
key/value store instead of an env var — `.env` is for infrastructure only.

### 6.3 Install, build, run

```
pnpm install                                     # once, at the repo root

pnpm --filter @klickit/server run migration:run  # apply all migrations (kfe_migrate role)

pnpm --filter @klickit/server run build          # build the server package — required before
pnpm --filter @klickit/contracts run build       # running apps/api or after any change to either

pnpm --filter @klickit/api run start:dev         # apps/api, ts-node, port 3000
pnpm --filter @klickit/worker run start:dev       # apps/worker, ts-node, port 3001 (health only)
pnpm --filter @klickit/web run dev                # apps/web, Next dev server, port 3002
```

Whole-monorepo tasks (Turborepo fans these out to every package's own script):

```
pnpm build       # turbo run build
pnpm test        # turbo run test
pnpm lint        # turbo run lint
pnpm typecheck   # turbo run typecheck
```

**`turbo run lint` (and the other turbo tasks) abort the whole run on the first task failure by
default** — a "successful"-looking full-workspace run does not by itself prove every package's own
script actually passed; if in doubt, re-run a specific package standalone
(`pnpm --filter <pkg> run lint`) to confirm.

**Never run `next build` in `apps/web` while its own `next dev` server is active** — they share the
same `.next` directory, and a production build run alongside a live dev server corrupts it. Stop the
dev server first.

### 6.4 Every lintable package needs its own `eslint.config.js`

ESLint 9's flat config resolves relative to the current working directory, not a package's declared
`main` — so every package with a `lint` script needs its own `eslint.config.js` at its own root,
wiring up the shared rule builder:

```js
"use strict";
const baseConfig = require("@klickit/config/eslint");
module.exports = [{ ignores: ["dist/**", "node_modules/**"] }, ...baseConfig];
```

(`apps/api`, `apps/worker`, `apps/web`, `packages/server`, `packages/contracts` all have one; `tools`
has no `lint` script and needs none.) A package missing this file will fail with "ESLint couldn't find
an eslint.config.(js|mjs|cjs) file" the moment its lint script is run standalone — this has actually
happened for three packages in this repo's history, caught only by running each package's lint script
individually rather than trusting a full-workspace run.

### 6.5 A recurring, non-obvious environment failure mode: duplicate pnpm peer instances

pnpm can occasionally resolve the same package (most often `@nestjs/core`) to two physically distinct
installed instances across different workspace packages, producing DI errors
(`UnknownDependenciesException`, or a `Reflector` that looks unresolvable) that read exactly like a real
application bug but are actually dependency-resolution drift. If you hit an inexplicable NestJS DI
failure that a `git diff` of your own change doesn't explain, run:

```
pnpm dedupe
pnpm why @nestjs/core -r   # confirm it now prints "Found 1 version"
```

before spending time debugging the "bug" as if it were application code.

## 7. Testing

`packages/server` has ~200+ spec files (unit tests co-located per module under `__tests__/`, plus
`*-e2e.integration.spec.ts` capstone tests per domain that spin up a **real** `DataSource` against a
real Postgres — not mocks — and exercise a full create→submit→approve→post lifecycle end to end).

- Run the whole server suite: `pnpm --filter @klickit/server run test`.
- On a modest machine, running the full suite at default Jest parallelism can OOM
  (`FATAL ERROR: Zone Allocation failed`) — pass `--maxWorkers=4` if that happens.
- Every `*.integration.spec.ts` calls `AppDataSource.initialize()`, which walks every migration; the
  shared Jest config's `testTimeout` (`packages/config/jest/base.js`) has already been raised once
  (30s → 90s) as the migration count grew — if you add enough migrations that this becomes tight again,
  raise it there (affects all ~36 integration specs at once), don't special-case one file.
- The dev database accumulates leftover rows from past test runs (`E2E-`/`S23PT*-`/`Slice*`-prefixed
  IDs). This is a known, pre-existing characteristic of this dev DB, not a bug in the current test run —
  if a row-count assertion fails with "expected N, got more," check whether the extra rows have an old
  `created_at` before assuming a regression. Don't delete this data as a side effect of an unrelated
  task; report it instead if it's blocking something.
- When changing a shared service's constructor signature (e.g. adding a new dependency like
  `NotifyService` to `ApprovalEngineService`), grep the whole repo for every real call site — test files
  construct these classes directly with hand-built constructor-arg stubs, and a bare `{}`/`{} as never`
  stub for a dependency that used to be genuinely unused can become a real runtime landmine once the
  method starts unconditionally calling into it. Give it a minimal *functional* stub (e.g.
  `{ listActiveUsersByRoleId: async () => [] }`), not just something that satisfies the type checker.

## 8. Key conventions and hard-won rules (summary)

These are worth internalizing before making changes — each was learned from a real, previously-hit
issue in this codebase, not theoretical:

1. **Rebuild `packages/server`/`packages/contracts` after any source change**, before restarting
   whatever consumes them (§3).
2. **Register new entities in `migrations/data-source.ts`'s own array**, not just via a module's
   `TypeOrmModule.forFeature()` (§4.6).
3. **Every cross-module import needs a documented exception in `module-deps.json`** — undeclared
   imports fail the lint build (§4.3).
4. **Cross-domain entity FKs import the specific entity file directly**, never the sibling module's
   barrel, to avoid circular-dependency crashes at boot (§4.3).
5. **Use `color-mix()`, not Tailwind `/NN` opacity modifiers, on any `--color-*`/brand token** (§5.4).
6. **Never run `next build` in `apps/web` while its `next dev` server is running** (§6.3).
7. **Every lintable package needs its own `eslint.config.js`** — don't assume one exists just because a
   `lint` script is declared (§6.4).
8. **An inexplicable NestJS DI error may be a duplicate-peer-instance pnpm issue** — try `pnpm dedupe`
   before assuming it's a real code bug (§6.5).
9. **`en.json`/`fr.json`/`sw.json` must stay key-for-key in sync** on every i18n change (§5.5).
10. **`unwrapApiResult()` must wrap every API call**, even ones whose response body is discarded (§5.2).
11. **The GL is written through `PostingService` only** — never insert into `gl_*` tables from a domain
    module directly (§4.7).

## 9. Where to go deeper

| Question | Look at |
|---|---|
| What are the full functional/business requirements? | `docs/phase-2/01-functional-requirements.md`, `docs/phase-2/03-business-rules.md` |
| What does the full C4 architecture + every ADR look like? | `docs/phase-3/01-system-architecture.md` (+ its two companion docs on comms/auth and deployment) |
| What's the exact schema, column by column? | `docs/phase-4/02-schema-platform-accounting.md`, `03-schema-student-finance.md`, `04-schema-operations.md` |
| Why does module X's `mayImport` list look the way it does? | Its own entry in `packages/config/eslint/module-deps.json` — every exception is explained in prose, in place |
| What was actually built, in what order, and what real bugs were found along the way? | `docs/phase-5/PROGRESS.md` (backend, module-by-module) and `docs/phase-6/PROGRESS.md` (frontend, slice-by-slice — the most granular running log of real decisions and real bugs in this whole repo) |
