"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReceiptResponseDto } from "@klickit/contracts";
import { RowActionButton } from "@/components/ui/row-action-button";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";

/**
 * A row this table can render — either the plain `ReceiptResponseDto` the
 * `studentId`/`sessionId`-scoped callers already pass, or (Phase 6 Slice 8
 * Part 4) a `ReceiptListItemResponseDto` (`ReceiptResponseDto` + real
 * `studentName`/`cashierName`) from the new global Receipts list. Declared
 * as a plain structural intersection (not imported from `@klickit/contracts`)
 * so the two pre-existing bare-array callers below need no changes at all —
 * `studentName`/`cashierName` are optional here and simply absent on their
 * data.
 */
type ReceiptTableRow = ReceiptResponseDto & { studentName?: string; cashierName?: string };

/**
 * Shared by the student detail page's Receipts card (`GET .../receipts?studentId=`),
 * the payments landing page's "this session's receipts" card
 * (`GET .../receipts?sessionId=`), AND (Phase 6 Slice 8 Part 4) the new
 * global Receipts screen (`GET .../receipts` with neither, `payments:receipt:view-all`).
 * The first two remain bare unbounded arrays with client-side `<DataTable>`
 * pagination (unchanged — no `serverPagination` passed); the global list
 * passes a real `serverPagination` (its endpoint IS paginated) plus
 * `showStudentAndCashier` to reveal the two extra columns only meaningful in
 * that cross-student context — same component, no duplication, exactly the
 * plan's own "your call" instruction resolved in favor of one parametrized
 * table over a second component.
 *
 * **Invoice/Receipt "View" pass**: a new Actions column with an explicit
 * "View" (`Eye` icon) button linking to `/payments/receipts/{id}` — every
 * one of this table's callers gets it, for the same View-button consistency
 * the Pending/Upcoming Invoices lists just gained (`open-invoices-table.tsx`).
 * Redundant with the `number` column already being clickable, kept anyway
 * per the explicit ask.
 */
export function ReceiptsTable({
  receipts,
  showStudentAndCashier = false,
  serverPagination,
}: {
  receipts: ReceiptTableRow[];
  showStudentAndCashier?: boolean;
  serverPagination?: ServerPaginationState;
}) {
  const t = useTranslations("payments.receiptsTable");
  const tCommon = useTranslations("common");

  const columns: ColumnDef<ReceiptTableRow>[] = [
    {
      accessorKey: "number",
      header: t("number"),
      cell: ({ row }) => (
        <Link href={`/payments/receipts/${row.original.id}`} className="text-primary hover:underline">
          {row.original.number}
        </Link>
      ),
    },
    ...(showStudentAndCashier
      ? [{ accessorKey: "studentName", header: t("student") } satisfies ColumnDef<ReceiptTableRow>]
      : []),
    { accessorKey: "receiptDate", header: t("date") },
    { accessorKey: "payerName", header: t("payer") },
    ...(showStudentAndCashier
      ? [{ accessorKey: "cashierName", header: t("cashier") } satisfies ColumnDef<ReceiptTableRow>]
      : []),
    { accessorKey: "total", header: t("total"), cell: ({ row }) => formatMoney(row.original.total) },
    { accessorKey: "status", header: t("status") },
    {
      id: "actions",
      header: tCommon("actions"),
      cell: ({ row }) => (
        <RowActionButton asChild tone="view" label={tCommon("view")}>
          <Link href={`/payments/receipts/${row.original.id}`}>
            <Eye />
          </Link>
        </RowActionButton>
      ),
    },
  ];

  return <DataTable columns={columns} data={receipts} serverPagination={serverPagination} />;
}
