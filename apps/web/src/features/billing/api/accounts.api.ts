import type { AccountResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

/**
 * `gl_account.class` — mirrors `CreateAccountDtoSchema.class`'s real enum
 * literal-for-literal (`packages/contracts/src/accounting/create-account.schema.ts`,
 * itself generated from `packages/server`'s own `class-validator` DTO) —
 * confirmed directly rather than guessed, since `AccountResponseDto.class`
 * itself is only loosely typed `z.string()` in the generated zod schema (a
 * separate, known codegen looseness, not this literal union). No
 * `GlAccountClass` type is exported from `@klickit/contracts` itself, so
 * it's declared once here and reused by every caller that needs it
 * (`use-accounts.ts`, `gl-account-select.tsx`).
 */
export type GlAccountClass = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

/**
 * Phase 6 Slice 3 — GL account picker research outcome: `GET
 * /accounting/accounts` (`packages/server/src/accounting/api/accounts.controller.ts`,
 * permission `accounting:account:view`) is a REAL, existing list endpoint —
 * confirmed by reading the controller before assuming a fallback was
 * needed. It supports `class`/`isActive`/`parentId` query filters, all
 * declared required-`string` in the generated OpenAPI type (the same
 * codegen quirk `optionalQuery` exists for). `class=INCOME&isActive=true`
 * is exactly what `<GlAccountSelect>` needs for the fee-category
 * `glIncomeAccountId` picker — a real DTO, `AccountResponseDto`, is already
 * exported from `@klickit/contracts` (`packages/contracts/src/accounting/account-response.schema.ts`),
 * so no hand-typing was needed here (unlike `../types.ts`'s academic-year/term
 * gap).
 *
 * A real bug was found and fixed while live-verifying this slice: the
 * endpoint has NO `isPostable` query filter (only `class`/`isActive`/
 * `parentId`, confirmed by reading `accounts.controller.ts`), so the raw
 * list includes non-postable "header"/rollup accounts (e.g. the real dev-DB
 * seed's `4000 Income`, a parent of `4010 School Fees Income` etc.).
 * Picking a header account as a fee category's `glIncomeAccountId` looks
 * fine at fee-category-create time but makes `POST /billing/invoices/:id/post`
 * fail later with `"PostingService.post: account 4000 is not postable
 * (header account) — cannot be posted to"` — a real, confusing failure far
 * downstream of the actual mistake. Filtered out client-side here
 * (`account.isPostable === true`) since the backend offers no server-side
 * filter for it — `<GlAccountSelect>` now only ever offers real, postable
 * leaf accounts.
 *
 * Part 1 (Billing sub-features batch) — generalized to accept any
 * `GlAccountClass`, not just `INCOME`. Concession Schemes' `glAccountId` is
 * the DEBIT/contra side of a concession posting (an EXPENSE-class account),
 * needing the exact same postable-leaf-only picker shape but scoped to a
 * different class. `listIncomeAccounts()` below is kept as a thin
 * `class: "INCOME"` wrapper — zero behavior change for its existing Fee
 * Category caller.
 */
export async function listAccounts(accountClass: GlAccountClass): Promise<AccountResponseDto[]> {
  const accounts = await unwrapApiResult<AccountResponseDto[]>(
    await apiClient.GET("/api/v1/accounting/accounts", {
      params: { query: optionalQuery({ class: accountClass, isActive: "true", parentId: undefined }) },
    }),
  );
  return accounts.filter((account) => account.isPostable);
}

export async function listIncomeAccounts(): Promise<AccountResponseDto[]> {
  return listAccounts("INCOME");
}
