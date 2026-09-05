/**
 * Hand-mirrored response shapes for `DashboardController`
 * (`packages/server/src/domains/reporting/api/dashboard.controller.ts`).
 *
 * Why hand-mirrored instead of pulled from `@klickit/contracts`' generated
 * types: every one of these 10 handlers returns a plain inline object with
 * no `@ApiResponse({ type: SomeDto })` decorator, so `@nestjs/swagger`
 * recorded NO response schema for them at all — confirmed directly in
 * `packages/contracts/src/generated/openapi-types.ts`
 * (`DashboardController_*` operations all have `responses: { 200: { ...,
 * content?: never } }`). This is a real, pre-existing gap in
 * `packages/server`'s Swagger annotations, out of scope to fix from
 * apps/web (per this slice's own "don't modify packages/server" boundary)
 * — flagged here and in docs/phase-6/PROGRESS.md as a good follow-up for
 * whoever next touches that controller. These interfaces are typed
 * directly from the controller's own real return statements, not guessed.
 */

export interface TodaysCollectionResponse {
  date: string;
  total: string;
}

export interface OutstandingFeesResponse {
  total: string;
  byBucket: Record<string, string>;
}

export interface CollectionRateResponse {
  periodId: string;
  periodReceipts: string;
  openingAr: string;
  netBillings: string;
  denominator: string;
  collectionRate: number | null;
}

/**
 * Real row shape from `CashFlowReport.execute()`
 * (`packages/server/src/domains/reporting/application/cash-flow.report.ts`)
 * — one row per cash/bank/M-Pesa-clearing account, `Money` values
 * serialized as decimal strings (`Money.toJSON()`). Was previously typed as
 * `Record<string, unknown>[]` here (Phase 6 Slice 1's own deliberate scope
 * trim — the cash-flow widget only ever rendered a one-line row-count
 * summary) — made precise now that the widget shows real formatted totals.
 */
export interface CashFlowRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  cashIn: string;
  cashOut: string;
  netCashFlow: string;
}

export interface CashFlowResponse {
  rows: CashFlowRow[];
  totals?: { cashIn: string; cashOut: string; netCashFlow: string };
}

export interface RevenueExpenseSurplusResponse {
  revenue: string;
  expense: string;
  surplus: string;
}

export interface WalletLiabilityResponse {
  snapshotDate: string;
  totalBalance: string;
}

export interface DefaultersCountResponse {
  count: number;
}

export interface TopDefaulterRow {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  classId: string | null;
  overdueAmount: string;
  daysOverdue: number;
}

export interface CollectionTrendPoint {
  bucket: string;
  amount: string;
}

export interface IncomeVsExpensePoint {
  periodId: string;
  periodStartsOn: string;
  periodEndsOn: string;
  income: string;
  expense: string;
  netSurplus: string;
}

export interface RefreshMvsResponse {
  refreshed: string[];
}
