import type { DecideLateFeeBatchDto, LateFeeBatchResponseDto, RunLateFeeBatchDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `LateFeeBatchesController`
 * (`packages/server/src/domains/billing/api/late-fee-batches.controller.ts`) —
 * `POST /run`, `GET /?policyId=`, `GET /:id`, `POST /:id/decide`,
 * `POST /:id/post`. `billing:late-fee-batch:view` gates every GET,
 * `billing:late-fee-batch:run` gates run/decide/post (confirmed by reading
 * the controller directly).
 *
 * `listLateFeeBatches()`'s `policyId` param is genuinely REQUIRED, not
 * optional — `LateFeeBatchesController.list()`'s own real signature is
 * `@Query("policyId") policyId: string` with no default, matching
 * `budgets.api.ts`'s own `listBudgets(fiscalYearId: string)` shape
 * (confirmed directly in `generated/openapi-types.ts`'s
 * `LateFeeBatchesController_list` operation: `query: { policyId: string }`,
 * not `query?: {...}`) — no `optionalQuery()` wrapper needed here, unlike
 * this module's other genuinely-optional list filters.
 */
export async function listLateFeeBatches(policyId: string): Promise<LateFeeBatchResponseDto[]> {
  return unwrapApiResult<LateFeeBatchResponseDto[]>(
    await apiClient.GET("/api/v1/billing/late-fee-batches", { params: { query: { policyId } } }),
  );
}

export async function getLateFeeBatch(id: string): Promise<LateFeeBatchResponseDto> {
  return unwrapApiResult<LateFeeBatchResponseDto>(
    await apiClient.GET("/api/v1/billing/late-fee-batches/{id}", { params: { path: { id } } }),
  );
}

/** Runs `policyId` against its overdue population as of `runDate` — a deliberate, manual, human-triggered action; no scheduler exists anywhere in this codebase (see `LateFeeBatchesService.runBatch()`'s own doc comment). Returns the resulting batch already landed on its real status (`DRAFT` if nothing was overdue, `PENDING_APPROVAL` if the policy requires approval, or `POSTED` immediately otherwise). */
export async function runLateFeeBatch(dto: RunLateFeeBatchDto): Promise<LateFeeBatchResponseDto> {
  return unwrapApiResult<LateFeeBatchResponseDto>(await apiClient.POST("/api/v1/billing/late-fee-batches/run", { body: dto }));
}

/** `approved:true` posts the batch immediately (`onApprovalDecided()` calls `postInternal()` directly — there is no distinct `APPROVED` state to land on first); `approved:false` reverts to `DRAFT` — there is no `REJECTED` terminal state at all, so callers should word this "send back to Draft," never "reject." Only valid from `PENDING_APPROVAL` (a real 422 otherwise, confirmed by reading `LateFeeBatchesService.onApprovalDecided()` directly). */
export async function decideLateFeeBatch(id: string, dto: DecideLateFeeBatchDto): Promise<LateFeeBatchResponseDto> {
  return unwrapApiResult<LateFeeBatchResponseDto>(
    await apiClient.POST("/api/v1/billing/late-fee-batches/{id}/decide", { params: { path: { id } }, body: dto }),
  );
}

/** `LateFeeBatchesService.post()` accepts a batch in EITHER `DRAFT` or `PENDING_APPROVAL` (both mean "not yet posted") and only rejects an already-`POSTED` batch — confirmed by reading it directly, the same shape `DebitNotesService.post()` uses. */
export async function postLateFeeBatch(id: string): Promise<LateFeeBatchResponseDto> {
  return unwrapApiResult<LateFeeBatchResponseDto>(
    await apiClient.POST("/api/v1/billing/late-fee-batches/{id}/post", { params: { path: { id } } }),
  );
}

/**
 * `LateFeeBatchResponseDto.summary` is typed `Record<string, unknown>` on
 * the wire (a bare jsonb passthrough, no server-side `@ApiResponse` schema
 * for its inner shape) — this mirrors the REAL shape one level down,
 * confirmed by reading `LateFeeBatchesService`'s own exported
 * `LateFeeBatchSummary` interface directly
 * (`packages/server/src/domains/billing/application/late-fee-batches.service.ts`):
 * `{ totalAssessed: string; studentCount: number; entries: { studentId,
 * termId, amount, invoices: { invoiceId, daysOverdue, amount }[] }[] }`,
 * grouped by `(studentId, termId)` rather than `studentId` alone (a student
 * with overdue invoices spanning two terms gets two separate entries).
 */
export interface LateFeeBatchInvoiceBreakdown {
  invoiceId: string;
  daysOverdue: number;
  amount: string;
}

export interface LateFeeBatchSummaryEntry {
  studentId: string;
  termId: string;
  amount: string;
  invoices: LateFeeBatchInvoiceBreakdown[];
}

export interface LateFeeBatchSummary {
  totalAssessed: string;
  studentCount: number;
  entries: LateFeeBatchSummaryEntry[];
}

const EMPTY_SUMMARY: LateFeeBatchSummary = { totalAssessed: "0.0000", studentCount: 0, entries: [] };

/** Defensively parses `LateFeeBatchResponseDto.summary`'s untyped jsonb into the real `LateFeeBatchSummary` shape above — every field is `typeof`-checked (the same defensive discipline `late-fee-policies/[id]/page.tsx`'s own `ParamsView` already applies to `params`), never trusted blindly; a malformed/unexpected entry is silently dropped rather than throwing, since this backs display-only UI. */
export function parseLateFeeBatchSummary(raw: Record<string, unknown> | null | undefined): LateFeeBatchSummary {
  if (!raw) return EMPTY_SUMMARY;
  const totalAssessed = typeof raw.totalAssessed === "string" ? raw.totalAssessed : EMPTY_SUMMARY.totalAssessed;
  const studentCount = typeof raw.studentCount === "number" ? raw.studentCount : 0;
  const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
  const entries = rawEntries
    .map((entry) => parseEntry(entry as Record<string, unknown>))
    .filter((entry): entry is LateFeeBatchSummaryEntry => entry !== null);
  return { totalAssessed, studentCount, entries };
}

function parseEntry(entry: Record<string, unknown>): LateFeeBatchSummaryEntry | null {
  if (typeof entry.studentId !== "string" || typeof entry.termId !== "string" || typeof entry.amount !== "string") return null;
  const rawInvoices = Array.isArray(entry.invoices) ? entry.invoices : [];
  const invoices = rawInvoices
    .map((invoice) => parseInvoiceBreakdown(invoice as Record<string, unknown>))
    .filter((invoice): invoice is LateFeeBatchInvoiceBreakdown => invoice !== null);
  return { studentId: entry.studentId, termId: entry.termId, amount: entry.amount, invoices };
}

function parseInvoiceBreakdown(invoice: Record<string, unknown>): LateFeeBatchInvoiceBreakdown | null {
  if (typeof invoice.invoiceId !== "string" || typeof invoice.daysOverdue !== "number" || typeof invoice.amount !== "string") return null;
  return { invoiceId: invoice.invoiceId, daysOverdue: invoice.daysOverdue, amount: invoice.amount };
}
