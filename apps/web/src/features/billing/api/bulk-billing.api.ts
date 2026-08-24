import type { BulkGenerateDto, BulkGenerateResultDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `BulkBillingController` (`POST billing/bulk-billing/generate`,
 * permission `billing:bulk-billing:execute` — the SAME permission code the
 * already-built ad-hoc bulk tool's `BulkAdhocInvoicesController` uses,
 * confirmed by reading both controllers directly; they are functionally
 * distinct engines sharing one code, not a mistake to reconcile). Resolves
 * every ACTIVE student matching `classIds`/`streamIds` against their own
 * real PUBLISHED fee structure and generates+posts one invoice per student
 * (`source: STRUCTURE`) — genuinely distinct from
 * `bulk-adhoc-invoices.api.ts`'s `bulkGenerateAdhocInvoices()`, which bills
 * against an explicit fee-category selection instead (`source: ADHOC`).
 *
 * **Danger, confirmed by reading `BulkBillingService.bulkGenerate()`/
 * `.resolveStudents()` directly**: an empty `classIds` AND empty
 * `streamIds` means "every ACTIVE student in the entire school" — there is
 * ZERO server-side confirmation step or additional safeguard for that case.
 * This function is a plain, unguarded pass-through; the escalating
 * confirm-dialog flow in `components/bulk-billing-form.tsx` is the ONLY
 * safeguard standing between a misclick and billing an entire school — see
 * that file's own doc comment.
 *
 * No persisted tracking row exists for a run (unlike Late Fee Batches' real
 * `bill_late_fee_batch` table, confirmed by reading the service's own doc
 * comment) — the `{succeeded,failed}` result returned here exists ONLY in
 * this direct HTTP response, never queryable again afterward.
 */
export async function generateBulkBilling(dto: BulkGenerateDto): Promise<BulkGenerateResultDto> {
  return unwrapApiResult<BulkGenerateResultDto>(
    await apiClient.POST("/api/v1/billing/bulk-billing/generate", { body: dto }),
  );
}
