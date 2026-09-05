import type { BulkGenerateDto, BulkGenerateResultDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `BulkBillingController` (`POST billing/bulk-billing/generate`,
 * permission `billing:bulk-billing:execute`). Redesigned (2026-09-04) from a
 * fee-structure-driven generator into "regenerate like previous term": for
 * every ACTIVE student matching `classIds`/`streamIds`, the server finds
 * their own most recent non-VOID invoice from the term immediately
 * preceding the given `termId` (same academic year, `seq - 1`, no
 * cross-year fallback), carries forward that invoice's own fee categories,
 * and generates a new invoice for `termId` re-priced at the CURRENT
 * PUBLISHED fee structure's amount for each category — never the prior
 * invoice's own peso amount. `source: "CARRIED_FORWARD"` on the resulting
 * invoices, distinct from `bulk-adhoc-invoices.api.ts`'s
 * `bulkGenerateAdhocInvoices()` (`source: ADHOC`, an explicit fee-category
 * selection made by the accountant, not carried forward from history).
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
 * `bill_late_fee_batch` table) — the `{succeeded, failed, skipped}` result
 * returned here exists ONLY in this direct HTTP response, never queryable
 * again afterward. `skipped` (new) covers non-error outcomes — no
 * qualifying prior-term invoice, or every carried-forward category already
 * billed this term — distinct from `failed`, which is a real error (e.g. a
 * carried-forward category no longer exists on the current fee structure).
 */
export async function generateBulkBilling(dto: BulkGenerateDto): Promise<BulkGenerateResultDto> {
  return unwrapApiResult<BulkGenerateResultDto>(
    await apiClient.POST("/api/v1/billing/bulk-billing/generate", { body: dto }),
  );
}
