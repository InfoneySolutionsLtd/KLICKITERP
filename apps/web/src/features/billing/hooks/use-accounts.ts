"use client";

import { useQuery } from "@tanstack/react-query";
import { listAccounts, listIncomeAccounts, type GlAccountClass } from "../api/accounts.api";

/** `accounting:account:view`-gated server-side — a role that can manage fee categories but not chart-of-accounts will 403 here; `<GlAccountSelect>` falls back to a plain UUID text input in that case rather than blocking the whole fee-category form (see that component's own doc comment). */
export function useIncomeAccounts() {
  return useQuery({
    queryKey: ["billing", "accounts", "income"],
    queryFn: listIncomeAccounts,
  });
}

/**
 * Part 1 (Billing sub-features batch) — generalized sibling of
 * `useIncomeAccounts()` above, parameterized by `GlAccountClass`. Added for
 * `<GlAccountSelect accountClass="EXPENSE">` (Concession Schemes'
 * `glAccountId`), keyed separately per class so an EXPENSE picker and an
 * INCOME picker never share (or invalidate) each other's cache entry.
 */
export function useAccountsByClass(accountClass: GlAccountClass) {
  return useQuery({
    queryKey: ["billing", "accounts", accountClass.toLowerCase()],
    queryFn: () => listAccounts(accountClass),
  });
}
