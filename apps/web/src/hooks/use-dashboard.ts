"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type {
  CashFlowResponse,
  CollectionRateResponse,
  CollectionTrendPoint,
  DefaultersCountResponse,
  IncomeVsExpensePoint,
  OutstandingFeesResponse,
  RefreshMvsResponse,
  RevenueExpenseSurplusResponse,
  TodaysCollectionResponse,
  TopDefaulterRow,
  WalletLiabilityResponse,
} from "@/types/dashboard";

/** All 10 real `DashboardController` endpoints (docs/phase-6/PROGRESS.md scope item 8) — every hook here is `dashboard:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched. */
export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

/**
 * Phase 6 Slice 10 — an additive, optional `options.enabled` gate, same
 * shape `useStudents()`'s own `options?: {enabled?: boolean}` precedent
 * established (Slice 8 Part 1): defaults to `true` (byte-for-byte
 * unchanged behavior for every pre-existing call site that never passes
 * it). Used by `dashboard/page.tsx` to hold the MV-backed KPI queries
 * (`useOutstandingFees`/`useDefaultersCount`/`useTopDefaulters`/
 * `useRevenueExpenseSurplus`/`useWalletLiability`) until the page's own
 * mount-triggered `useRefreshDashboard()` mutation has settled —
 * `useTodaysCollection` (now a live query, not MV-backed) and
 * `useCollectionRate`/`useCollectionTrend`/`useCashFlow`/
 * `useIncomeVsExpense` deliberately do NOT get this option (see
 * `dashboard/page.tsx`'s own doc comment for which KPIs are MV-backed vs
 * live, and why the trend/chart queries don't need page-load gating even
 * though some of them do still read an MV).
 */
export interface DashboardQueryOptions {
  enabled?: boolean;
}

export function useTodaysCollection() {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "todays-collection"],
    queryFn: async () => unwrapApiResult<TodaysCollectionResponse>(await apiClient.GET("/api/v1/dashboard/todays-collection")),
  });
}

export function useOutstandingFees(options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "outstanding-fees"],
    queryFn: async () => unwrapApiResult<OutstandingFeesResponse>(await apiClient.GET("/api/v1/dashboard/outstanding-fees")),
    enabled: options?.enabled ?? true,
  });
}

export function useCollectionRate(periodId: string | undefined) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "collection-rate", periodId],
    queryFn: async () =>
      unwrapApiResult<CollectionRateResponse>(
        await apiClient.GET("/api/v1/dashboard/collection-rate", { params: { query: { periodId: periodId as string } } }),
      ),
    enabled: !!periodId,
  });
}

export function useCashFlow(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "cash-flow", fromDate, toDate],
    queryFn: async () => unwrapApiResult<CashFlowResponse>(await apiClient.GET("/api/v1/dashboard/cash-flow", { params: { query: { fromDate, toDate } } })),
  });
}

export function useRevenueExpenseSurplus(periodId: string | undefined, options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "revenue-expense-surplus", periodId],
    queryFn: async () =>
      unwrapApiResult<RevenueExpenseSurplusResponse>(
        await apiClient.GET("/api/v1/dashboard/revenue-expense-surplus", { params: { query: { periodId: periodId as string } } }),
      ),
    enabled: !!periodId && (options?.enabled ?? true),
  });
}

export function useWalletLiability(options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "wallet-liability"],
    queryFn: async () => unwrapApiResult<WalletLiabilityResponse>(await apiClient.GET("/api/v1/dashboard/wallet-liability")),
    enabled: options?.enabled ?? true,
  });
}

export function useDefaultersCount(options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "defaulters-count"],
    queryFn: async () => unwrapApiResult<DefaultersCountResponse>(await apiClient.GET("/api/v1/dashboard/defaulters/count")),
    enabled: options?.enabled ?? true,
  });
}

export function useTopDefaulters(limit = 10, options?: DashboardQueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "defaulters-top", limit],
    queryFn: async () =>
      unwrapApiResult<TopDefaulterRow[]>(await apiClient.GET("/api/v1/dashboard/defaulters/top", { params: { query: { limit } } })),
    enabled: options?.enabled ?? true,
  });
}

export function useCollectionTrend(bucket: "day" | "week" | "month" | "term", fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "collection-trend", bucket, fromDate, toDate],
    queryFn: async () =>
      unwrapApiResult<CollectionTrendPoint[]>(
        await apiClient.GET("/api/v1/dashboard/charts/collection-trend", { params: { query: { bucket, fromDate, toDate } } }),
      ),
  });
}

export function useIncomeVsExpense(fromPeriodId: string | undefined, toPeriodId: string | undefined) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "income-vs-expense", fromPeriodId, toPeriodId],
    queryFn: async () =>
      unwrapApiResult<IncomeVsExpensePoint[]>(
        await apiClient.GET("/api/v1/dashboard/charts/income-vs-expense", {
          params: { query: { fromPeriodId: fromPeriodId as string, toPeriodId: toPeriodId as string } },
        }),
      ),
    enabled: !!fromPeriodId && !!toPeriodId,
  });
}

const REFRESH_MVS_TIMEOUT_MS = 20_000;

/**
 * `dashboard/page.tsx`'s mount effect fires this once and gates 6 KPI tiles
 * (`outstandingFees`/`defaultersCount`/`revenueExpenseSurplus`×3/
 * `walletLiability`) behind it via `mvKpisReady = isSuccess || isError`.
 *
 * `Promise.race()` against a plain `setTimeout` rejection bounds this call
 * to `REFRESH_MVS_TIMEOUT_MS`, so a genuinely slow/unresponsive backend
 * still flips `isError` true and unblocks the gate (falling back to
 * whatever the MVs already hold) instead of hanging forever.
 *
 * **A second, separate, now-fixed hang (found live, 2026-09-05)**: the
 * mount effect that calls this mutation used to guard itself with a
 * `hasFiredMountRefreshRef` ref ("only ever call `.mutate()` once, even
 * under React 18/19 Strict Mode's dev-only double-invoke of mount
 * effects"). That guard was the bug: confirmed via direct diagnostic
 * logging that the mutation's own `mutationFn`/`onSuccess`/`onSettled` DID
 * run to completion every time (the real network call always succeeded),
 * yet `dashboard/page.tsx` kept reading `isPending: true` forever — proven
 * NOT a general "this component doesn't re-render" issue by placing an
 * unrelated, unguarded probe `useMutation` in the same component, which
 * updated correctly on every run. Strict Mode's double-invoke doesn't just
 * re-run a plain `useEffect`'s setup/cleanup — it also tears down and
 * rebuilds `useMutation`'s OWN internal query-observer subscription for
 * the whole component. The ref guard let ONLY the FIRST of the two
 * Strict-Mode invocations call `.mutate()`; that first invocation's
 * subscription is exactly the one torn down before its network call
 * resolves, so its eventual success notifies nobody. The SECOND
 * invocation — whose subscription survives — never fired, because the
 * ref had already flipped true. Removing the ref guard (`dashboard/
 * page.tsx`'s mount effect now just calls `.mutate()` unconditionally)
 * fixes this: in a production build Strict Mode's double-invoke never
 * happens, so this still fires exactly once; in dev it fires twice
 * (a second, harmless, idempotent MV-refresh call) but the SURVIVING
 * invocation's subscription is the one that resolves, so `isSuccess`/
 * `isError` correctly reach the component every time. This is invisible
 * in a production build, which is presumably why it was never caught
 * before — dev-mode Strict Mode is exactly where it reproduces 100% of
 * the time.
 */
export function useRefreshDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await Promise.race([
        apiClient.POST("/api/v1/dashboard/refresh-mvs"),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Dashboard refresh timed out — the server may be temporarily unavailable.")), REFRESH_MVS_TIMEOUT_MS),
        ),
      ]);
      return unwrapApiResult<RefreshMvsResponse>(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}
