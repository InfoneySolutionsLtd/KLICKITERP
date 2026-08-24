"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BulkGenerateDto } from "@klickit/contracts";
import { generateBulkBilling } from "../api/bulk-billing.api";
import { INVOICES_QUERY_KEY } from "./use-invoices";

/**
 * A single mutation, no list/detail hooks — `BulkBillingService.bulkGenerate()`
 * persists no tracking row of its own (see `bulk-billing.api.ts`'s doc
 * comment), so the `{succeeded,failed}` result exists only in this
 * mutation's own response object; `bulk-billing-form.tsx` renders it inline
 * as soon as it resolves and never navigates away from it.
 *
 * Invalidates `INVOICES_QUERY_KEY` broadly on success — every succeeded
 * student's own invoice list was just touched by this run, and (unlike
 * `useGenerateInvoice()`'s single-student mutation) there's no single
 * `studentId` to scope the invalidation to, the same reasoning
 * `useBulkGenerateAdhocInvoices()` (`use-bulk-adhoc-invoices.ts`) already
 * documents for the sibling ad-hoc bulk tool.
 */
export function useBulkBilling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: BulkGenerateDto) => generateBulkBilling(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
    },
  });
}
