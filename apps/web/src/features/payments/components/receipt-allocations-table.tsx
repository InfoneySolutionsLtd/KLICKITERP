"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReceiptAllocationResponseDto } from "@klickit/contracts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useInvoiceLines } from "@/features/billing/hooks/use-invoices";
import { useFeeCategories } from "@/features/billing/hooks/use-fee-categories";

/**
 * Renders ONLY what `GET /payments/receipts/{id}` actually returned —
 * allocations are server-computed oldest-invoice-first by
 * `AllocationService.resolveAllocations()` (BR-PAY-03); this component never
 * computes/previews an allocation client-side, per the plan's explicit
 * instruction.
 *
 * Phase 6 Slice 8 (Part 4) display polish: a non-`toPrepayment` row now links
 * the REAL invoice number the backend resolved (`alloc.invoiceNumber`, e.g.
 * `BIL-000047`) instead of the generic word "Invoice" — falls back to that
 * generic label only in the defensive/should-never-happen case of a non-null
 * `invoiceId` with a `null` `invoiceNumber`. A `toPrepayment:true` row now
 * renders a visually distinct `soft-warning` `<Badge>` ("Overpayment / credit
 * balance") instead of blending in as plain cell text — reusing this
 * codebase's existing `badge.tsx` variant (no new CSS), the same tinted-pill
 * treatment `InvoiceStatusBadge`/`KpiCard`'s tone icons already establish.
 *
 * **Invoice/Receipt "View" pass**: each non-prepayment row can now expand to
 * show the fee-category lines of the invoice it was allocated to
 * (`useInvoiceLines(invoiceId)`, lazily enabled only once expanded — no
 * query fires for a row nobody opens). **Deliberately honest about what this
 * IS and ISN'T**: `ReceiptAllocationResponseDto` only ever records an
 * amount-per-INVOICE (`AllocationService.resolveAllocations()` allocates
 * oldest-invoice-first, never sub-divided per fee line), so this expansion
 * shows "the fee categories THIS INVOICE covers" as context — never a claim
 * that this specific receipt's payment was split precisely per category,
 * since that data genuinely doesn't exist. The `expandedInvoiceCategoryHint`
 * copy says this plainly.
 */
export function ReceiptAllocationsTable({ allocations }: { allocations: ReceiptAllocationResponseDto[] }) {
  const t = useTranslations("payments.receiptDetail.allocationsTable");
  const [expandedInvoiceId, setExpandedInvoiceId] = React.useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>{t("target")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocations.map((alloc) => {
            const isExpanded = !alloc.toPrepayment && !!alloc.invoiceId && expandedInvoiceId === alloc.invoiceId;
            return (
              <React.Fragment key={alloc.id}>
                <TableRow>
                  <TableCell>
                    {!alloc.toPrepayment && alloc.invoiceId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label={t("toggleLines")}
                        onClick={() => setExpandedInvoiceId(isExpanded ? null : (alloc.invoiceId as string))}
                      >
                        {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    {alloc.toPrepayment ? (
                      <Badge variant="soft-warning">{t("prepayment")}</Badge>
                    ) : alloc.invoiceId ? (
                      <Link href={`/billing/invoices/${alloc.invoiceId}`} className="text-primary hover:underline">
                        {alloc.invoiceNumber ?? t("invoice")}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{formatMoney(alloc.amount)}</TableCell>
                </TableRow>
                {isExpanded && alloc.invoiceId && <AllocationInvoiceLines invoiceId={alloc.invoiceId} />}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function AllocationInvoiceLines({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("payments.receiptDetail.allocationsTable");
  const linesQuery = useInvoiceLines(invoiceId);
  const categoriesQuery = useFeeCategories();
  const categoryNameById = React.useMemo(() => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])), [categoriesQuery.data]);

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell />
      <TableCell colSpan={2}>
        <p className="mb-2 text-xs text-muted-foreground">{t("expandedInvoiceCategoryHint")}</p>
        {linesQuery.isPending ? (
          <p className="text-xs text-muted-foreground">{t("loadingLines")}</p>
        ) : linesQuery.isError ? (
          <p className="text-xs text-destructive">{t("loadingLinesError")}</p>
        ) : linesQuery.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noLines")}</p>
        ) : (
          <ul className="space-y-1">
            {linesQuery.data.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium text-foreground">{categoryNameById.get(line.feeCategoryId) ?? line.feeCategoryId}</span>
                  {line.description && <span className="text-muted-foreground"> — {line.description}</span>}
                </span>
                <span className="text-foreground">{formatMoney(line.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </TableCell>
    </TableRow>
  );
}
