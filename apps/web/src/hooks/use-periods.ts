"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { FiscalYearResponseDto, PeriodResponseDto } from "@klickit/contracts";

/**
 * FLAGGED DECISION #3 (docs/phase-6/PROGRESS.md): the dashboard's
 * period-scoped endpoints (`collection-rate`, `revenue-expense-surplus`,
 * `charts/income-vs-expense`) need a `periodId`/`fromPeriodId`/`toPeriodId`
 * and this slice builds no dedicated period-management screen. The only
 * period data cheaply available is `accounting`'s own real
 * `GET /accounting/fiscal-years` + `GET /accounting/fiscal-years/{id}/periods`
 * (confirmed via `packages/contracts` — no other/cheaper period-listing
 * endpoint exists). Resolution used here: pick the fiscal year with
 * `status === "OPEN"` (falling back to the most recently started one if
 * none is OPEN), list its periods, and resolve "current" as the period
 * whose `[startsOn, endsOn]` window contains today — falling back to the
 * most recent `OPEN` period, then simply the last period in the list.
 */
export function useFiscalYears() {
  return useQuery({
    queryKey: ["accounting", "fiscal-years"],
    queryFn: async () => {
      const result = await apiClient.GET("/api/v1/accounting/fiscal-years");
      return unwrapApiResult<FiscalYearResponseDto[]>(result);
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Real bug found live (2026-09-05): a school should only ever have ONE
 * genuinely `OPEN` fiscal year, but this dev database also carries a large
 * number of leftover E2E-test-created fiscal years that are ALSO `status
 * === "OPEN"` (each a single all-encompassing `2015-01-01`-`2035-12-31`
 * period, created so test runs never had to think about date-range edge
 * cases). The old `.find((fy) => fy.status === "OPEN")` took whichever one
 * the backend happened to return first — arbitrary from the user's
 * perspective — which is how the dashboard ended up scoped to a 20-year
 * "period" instead of the real current one, cascading into a wrong/empty
 * Income vs Expense chart and a null Collection Rate.
 *
 * Fixed by preferring, among every `OPEN` fiscal year, the one whose own
 * `[startsOn, endsOn]` window both contains today AND is narrowest — a
 * real annual fiscal year is ~365 days; a stray test fixture spanning
 * decades never wins against a real one that also contains today. Only
 * once no OPEN year contains today at all does this fall back to the
 * previous "most recently started" heuristic, so a fresh/newly-provisioned
 * database with a single real OPEN year behaves exactly as before.
 *
 * **Second-level tie-break (found live, same investigation)**: this dev
 * database also carries several E2E-test fiscal years that happen to ALSO
 * span a real-looking ~365 days (e.g. a whole year as a single period),
 * tying with the genuine fiscal year on span alone. Every id in this
 * system is a ULID/UUIDv7 (time-ordered — confirmed throughout this
 * codebase, e.g. every seeded permission id shares an early, common
 * prefix), so the lexicographically SMALLEST id among tied candidates was
 * created earliest — i.e. it's the one deliberately provisioned when the
 * database was first set up, not one spun up mid-test-run. This is a
 * genuine, non-arbitrary tie-break (not a guess at test-data naming
 * conventions), and is a no-op in a clean database where no ties exist.
 */
function spanDays(startsOn: string, endsOn: string): number {
  return (new Date(endsOn).getTime() - new Date(startsOn).getTime()) / 86_400_000;
}

export function useCurrentFiscalYear() {
  const query = useFiscalYears();
  const fiscalYears = query.data ?? [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const openYears = fiscalYears.filter((fy) => fy.status === "OPEN");
  const openContainingToday = openYears
    .filter((fy) => fy.startsOn <= todayIso && todayIso <= fy.endsOn)
    .sort((a, b) => spanDays(a.startsOn, a.endsOn) - spanDays(b.startsOn, b.endsOn) || (a.id < b.id ? -1 : 1));
  const current =
    openContainingToday[0] ??
    openYears[0] ??
    [...fiscalYears].sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0] ??
    null;
  return { ...query, currentFiscalYear: current };
}

export function usePeriods(fiscalYearId: string | undefined) {
  return useQuery({
    queryKey: ["accounting", "fiscal-years", fiscalYearId, "periods"],
    queryFn: async () => {
      const result = await apiClient.GET("/api/v1/accounting/fiscal-years/{id}/periods", {
        params: { path: { id: fiscalYearId as string } },
      });
      return unwrapApiResult<PeriodResponseDto[]>(result);
    },
    enabled: !!fiscalYearId,
    staleTime: 5 * 60_000,
  });
}

export function resolveCurrentPeriod(periods: PeriodResponseDto[]): PeriodResponseDto | null {
  if (periods.length === 0) return null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const containing = periods.find((p) => p.startsOn <= todayIso && todayIso <= p.endsOn);
  if (containing) return containing;
  const open = [...periods].filter((p) => p.status === "OPEN").sort((a, b) => b.seq - a.seq)[0];
  if (open) return open;
  return [...periods].sort((a, b) => b.seq - a.seq)[0];
}

/**
 * Combines the two calls above into the one thing dashboard widgets
 * actually need: the current fiscal year's period list plus the resolved
 * "current" period.
 */
export function useCurrentPeriodContext() {
  const fyQuery = useCurrentFiscalYear();
  const periodsQuery = usePeriods(fyQuery.currentFiscalYear?.id);
  const periods = periodsQuery.data ?? [];
  const currentPeriod = resolveCurrentPeriod(periods);

  return {
    isLoading: fyQuery.isLoading || periodsQuery.isLoading,
    isError: fyQuery.isError || periodsQuery.isError,
    periods,
    currentPeriod,
  };
}
