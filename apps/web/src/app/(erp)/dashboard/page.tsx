"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Banknote,
  ClipboardCheck,
  Gauge,
  GraduationCap,
  Landmark,
  LineChart,
  PiggyBank,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Reveal } from "@/components/patterns/reveal";
import { DashboardGreeting } from "@/components/dashboard/greeting";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { CollectionRateGauge } from "@/components/dashboard/collection-rate-gauge";
import { CollectionTrendChart } from "@/components/dashboard/collection-trend-chart";
import { IncomeExpenseChart } from "@/components/dashboard/income-expense-chart";
import { CashFlowSummary } from "@/components/dashboard/cash-flow-summary";
import { DefaultersTable } from "@/components/dashboard/defaulters-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { formatMoney } from "@/lib/money";
import { staggerDelay } from "@/lib/motion";
import { useCurrentPeriodContext } from "@/hooks/use-periods";
import { useInbox } from "@/features/approvals/hooks/use-instances";
import { useStudents } from "@/features/students/hooks/use-students";
import { useRuns } from "@/features/payroll/hooks/use-payroll-runs";
import {
  useCashFlow,
  useCollectionRate,
  useCollectionTrend,
  useDefaultersCount,
  useIncomeVsExpense,
  useOutstandingFees,
  useRefreshDashboard,
  useRevenueExpenseSurplus,
  useTodaysCollection,
  useTopDefaulters,
  useWalletLiability,
} from "@/hooks/use-dashboard";

/** Payroll runs aren't returned in any guaranteed order — `periodKey` (a sortable "YYYY-MM" string) descending is the real "most recent" run. */
function latestPayrollRun<T extends { periodKey: string }>(runs: T[]): T | undefined {
  return [...runs].sort((a, b) => b.periodKey.localeCompare(a.periodKey))[0];
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const TODAY_ISO = new Date().toISOString().slice(0, 10);

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tKpi = useTranslations("dashboard.kpis");
  const tPayrollStatus = useTranslations("payroll.runs.statuses");

  const { periods, currentPeriod } = useCurrentPeriodContext();
  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!selectedPeriodId && currentPeriod) {
      setSelectedPeriodId(currentPeriod.id);
    }
  }, [currentPeriod, selectedPeriodId]);

  // Income-vs-Expense range: up to the last 6 periods ending at the
  // selected one (flagged decision #3 — see period-selector.tsx / use-periods.ts).
  const sortedPeriods = [...periods].sort((a, b) => a.seq - b.seq);
  const selectedIndex = sortedPeriods.findIndex((p) => p.id === selectedPeriodId);
  const rangeStart = selectedIndex >= 0 ? Math.max(0, selectedIndex - 5) : 0;
  const fromPeriodId = selectedIndex >= 0 ? sortedPeriods[rangeStart]?.id : undefined;
  const toPeriodId = selectedPeriodId;

  // Phase 6 Slice 10 — auto-refresh on mount, then gate the MV-backed KPI
  // queries behind that refresh's completion. `mv_daily_collections`/
  // `mv_ar_summary`/`mv_income_expense`/`mv_wallet_liability`/
  // `mv_defaulters` have NO automatic refresh cadence (`MvRefreshService`'s
  // own doc comment) — only this mutation (`POST /dashboard/refresh-mvs`)
  // updates them, previously only reachable via the manual "Refresh data"
  // button below (which stays, unchanged, for an on-demand mid-session
  // nudge).
  const refreshMutation = useRefreshDashboard();
  // Settled (either way) = safe to let the gated queries fire. Deliberately
  // NOT `isSuccess` alone — a genuine refresh FAILURE must still let the
  // KPI queries fire (against whatever data the MVs already hold) so the
  // page degrades gracefully instead of staying blank forever behind a
  // dead gate.
  const mvKpisReady = refreshMutation.isSuccess || refreshMutation.isError;

  React.useEffect(() => {
    // Deliberately unconditional — see `useRefreshDashboard()`'s own doc
    // comment for the real bug this now avoids: a `useRef` "only fire once"
    // guard here used to permanently strand every gated KPI tile in dev,
    // because React 18/19 Strict Mode's double-invoke of mount effects also
    // tears down and rebuilds `useMutation`'s own subscription, and the
    // guard let only the FIRST (soon-torn-down) invocation ever call
    // `.mutate()`. A production build never double-invokes, so this still
    // fires exactly once there; dev fires it twice (a second, harmless,
    // idempotent MV-refresh call), but the SURVIVING invocation's
    // subscription is the one that resolves, so `isSuccess`/`isError`
    // reliably reach this component every time.
    refreshMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todaysCollection = useTodaysCollection(); // live query (Slice 10) — never MV-backed, no gating needed
  const outstandingFees = useOutstandingFees({ enabled: mvKpisReady }); // mv_ar_summary
  const collectionRate = useCollectionRate(selectedPeriodId); // live ledger query (see getCollectionRate()'s own doc comment) — not MV-backed, no gating needed
  const revenueExpenseSurplus = useRevenueExpenseSurplus(selectedPeriodId, { enabled: mvKpisReady }); // mv_income_expense
  const walletLiability = useWalletLiability({ enabled: mvKpisReady }); // mv_wallet_liability
  const defaultersCount = useDefaultersCount({ enabled: mvKpisReady }); // mv_defaulters
  const topDefaulters = useTopDefaulters(10, { enabled: mvKpisReady }); // mv_defaulters
  // mv_daily_collections-backed too, but deliberately NOT gated: a 30-day
  // historical trend/cash-flow/income-vs-expense series doesn't need
  // second-by-second correctness the way a single "right now" tile does
  // (the plan's own explicit scope boundary for this fix).
  const collectionTrend = useCollectionTrend("day", isoDaysAgo(30), TODAY_ISO);
  const cashFlow = useCashFlow(isoDaysAgo(90), TODAY_ISO);
  const incomeVsExpense = useIncomeVsExpense(fromPeriodId, toPeriodId);

  // Phase 6 dashboard redesign — "most critical live snapshots from other
  // features" (the user's own ask): each of these hits a DIFFERENT
  // permission-gated endpoint than the billing-domain KPIs above
  // (`approvals:instance:view` / `students:student:view` /
  // `payroll:run:view`, not `dashboard:view`), so each keeps its own
  // `<QueryBoundary>` — a role missing just one of these permissions still
  // sees every other tile render normally, same "one failing widget never
  // blanks the page" rule the rest of this page already follows.
  const pendingApprovals = useInbox(); // GET /approvals/instances/inbox — already server-side scoped to "actionable by me right now"
  const activeStudents = useStudents({ status: "ACTIVE", page: 1, pageSize: 1 }); // real server-side `total`, pageSize:1 so this never pulls actual student rows just to count them
  const payrollRuns = useRuns(); // small, unpaginated array — "latest run" is picked client-side below

  return (
    // Slice 1.5b (visual polish iteration): `space-y-6` -> `space-y-8` and
    // the KPI/chart grid gaps `gap-4` -> `gap-5` — a more deliberate section
    // rhythm (this round's own "generous, deliberate whitespace" note),
    // while keeping the tight `gap-2`/`gap-4` spacing inside each
    // card/header untouched (that's content-density spacing, a different
    // concern from section-to-section rhythm).
    <div className="space-y-8">
      {/* Slice 1.5c (docs/phase-6/PROGRESS.md): real-name, real-time-of-day
          greeting, above the page's own title/KPI grid per the user's ask.
          Its own file documents why it's a self-updating client component
          rather than a value computed once and frozen at page load. */}
      <DashboardGreeting />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          <PeriodSelector periods={periods} value={selectedPeriodId} onChange={setSelectedPeriodId} />
          <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} variant="outline">
            <RefreshCw className={refreshMutation.isPending ? "animate-spin" : ""} />
            {refreshMutation.isPending ? t("refreshing") : t("refreshButton")}
          </Button>
        </div>
      </div>

      <p className="-mt-4 text-xs text-muted-foreground">{t("currencyNote")}</p>

      {/* Each widget below gets its OWN <QueryBoundary> instance — a failing
          endpoint (e.g. a 403 for a role missing dashboard:view) never
          blanks the rest of the page. Slice 1.5 (visual redesign):
          `collectionRate` moved OUT of this KPI grid into its own gauge
          card below (judgment call #3) — a squarish radial meter doesn't
          fit a rectangular KPI row; the remaining 7 KPI cards each got a
          semantically-matched lucide icon per the redesign plan. Slice 1.5b
          (visual polish iteration): each <KpiCard> gets a 0-based `index`
          for its own staggered fade+rise mount animation (see
          kpi-card.tsx's doc comment on why this is a best-effort stagger,
          not a lock-step one, given each card's independent query). */}
      <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <QueryBoundary query={todaysCollection}>
          {(data) => <KpiCard title={tKpi("todaysCollection")} value={formatMoney(data.total)} subtitle={data.date} icon={Wallet} index={0} />}
        </QueryBoundary>

        <QueryBoundary query={outstandingFees}>
          {(data) => <KpiCard title={tKpi("outstandingFees")} value={formatMoney(data.total)} tone="warning" icon={AlertTriangle} index={1} />}
        </QueryBoundary>

        <QueryBoundary query={defaultersCount}>
          {(data) => <KpiCard title={tKpi("defaultersCount")} value={String(data.count)} tone="destructive" icon={Users} index={2} />}
        </QueryBoundary>

        <QueryBoundary query={revenueExpenseSurplus}>
          {(data) => <KpiCard title={tKpi("revenue")} value={formatMoney(data.revenue)} tone="success" icon={TrendingUp} index={3} />}
        </QueryBoundary>

        <QueryBoundary query={revenueExpenseSurplus}>{(data) => <KpiCard title={tKpi("expense")} value={formatMoney(data.expense)} icon={TrendingDown} index={4} />}</QueryBoundary>

        <QueryBoundary query={revenueExpenseSurplus}>
          {(data) => (
            <KpiCard
              title={tKpi("surplus")}
              value={formatMoney(data.surplus)}
              tone={data.surplus.startsWith("-") ? "destructive" : "success"}
              icon={PiggyBank}
              index={5}
            />
          )}
        </QueryBoundary>

        <QueryBoundary query={walletLiability}>
          {(data) => <KpiCard title={tKpi("walletLiability")} value={formatMoney(data.totalBalance)} subtitle={data.snapshotDate} icon={Landmark} index={6} />}
        </QueryBoundary>

        <QueryBoundary query={activeStudents}>
          {(data) => <KpiCard title={tKpi("activeStudents")} value={String(data.total)} icon={GraduationCap} index={7} />}
        </QueryBoundary>

        {/* `isEmpty={() => false}` — a zero-length inbox is this tile's own
            common/happy case ("nothing needs your approval right now"), not
            a "no data" resting state; see the payroll tile below for the
            full reasoning. */}
        <QueryBoundary query={pendingApprovals} isEmpty={() => false}>
          {(data) => (
            <KpiCard title={tKpi("pendingApprovals")} value={String(data.length)} tone={data.length > 0 ? "warning" : "default"} icon={ClipboardCheck} index={8} />
          )}
        </QueryBoundary>

        {/* `isEmpty={() => false}` — `<QueryBoundary>`'s own "empty" state is a
            spacious full-width panel meant for a table/chart card, not a
            compact KPI-grid slot; a school with zero payroll runs yet is a
            real, valid case handled inline below with a same-sized tile
            instead. */}
        <QueryBoundary query={payrollRuns} isEmpty={() => false}>
          {(data) => {
            const latest = latestPayrollRun(data);
            if (!latest) return <KpiCard title={tKpi("payrollStatus")} value={tKpi("noPayrollRuns")} icon={Banknote} index={9} />;
            const tone = latest.status === "PENDING_APPROVAL" || latest.status === "REVIEW" ? "warning" : latest.status === "DRAFT" || latest.status === "COMPUTED" ? "default" : "success";
            return <KpiCard title={tKpi("payrollStatus")} value={tPayrollStatus(latest.status)} subtitle={latest.periodKey} tone={tone} icon={Banknote} index={9} />;
          }}
        </QueryBoundary>
      </div>

      {/* `items-stretch` (CSS Grid's own default, stated explicitly here since
          it's the one thing making every card in this row match height
          regardless of its own content — a taller "Collection Trend" chart
          no longer leaves "Collection Rate"/"Income vs Expense" looking
          short) — see `<Reveal className="h-full">` and `<DashboardCard>`'s
          own `h-full` for how that stretch actually reaches the visible
          card, not just its invisible motion.div wrapper. */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
        <Reveal delay={staggerDelay(7)} className="h-full">
          <DashboardCard title={tKpi("collectionRate")} icon={Gauge}>
            <QueryBoundary query={collectionRate}>
              {(data) => <CollectionRateGauge rate={data.collectionRate} subtitle={formatMoney(data.periodReceipts)} />}
            </QueryBoundary>
          </DashboardCard>
        </Reveal>

        <Reveal delay={staggerDelay(8)} className="h-full">
          <DashboardCard title={t("charts.collectionTrend")} icon={LineChart}>
            <QueryBoundary query={collectionTrend} isEmpty={(d) => d.length === 0}>
              {(data) => <CollectionTrendChart points={data} />}
            </QueryBoundary>
          </DashboardCard>
        </Reveal>

        <Reveal delay={staggerDelay(9)} className="h-full">
          <DashboardCard title={t("charts.incomeVsExpense")} icon={BarChart3}>
            <QueryBoundary query={incomeVsExpense} isEmpty={(d) => d.length === 0}>
              {(data) => <IncomeExpenseChart points={data} />}
            </QueryBoundary>
          </DashboardCard>
        </Reveal>
      </div>

      <Reveal delay={staggerDelay(10)}>
        <DashboardCard title={t("defaulters.title")} icon={Users}>
          <QueryBoundary query={topDefaulters} isEmpty={(d) => d.length === 0}>
            {(data) => <DefaultersTable rows={data} />}
          </QueryBoundary>
        </DashboardCard>
      </Reveal>

      <Reveal delay={staggerDelay(11)}>
        <DashboardCard title={t("cashFlow.title")} icon={ArrowLeftRight}>
          <QueryBoundary query={cashFlow} isEmpty={(d) => d.rows.length === 0}>
            {(data) => <CashFlowSummary totals={data.totals} />}
          </QueryBoundary>
        </DashboardCard>
      </Reveal>
    </div>
  );
}
