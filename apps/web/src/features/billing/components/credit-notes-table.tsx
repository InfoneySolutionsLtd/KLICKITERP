"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { CreditNoteResponseDto } from "@klickit/contracts";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { CreditNoteStatusBadge } from "./status-badges";
import { CreditNoteStatusActions } from "./credit-note-status-actions";

/**
 * Phase 6 Slice 22 Part 5 — `GET /billing/credit-notes?invoiceId=`, read-only
 * listing + inline `CreditNoteStatusActions` per row, rendered on the
 * invoice detail page's own "Credit Notes" section
 * (`app/(erp)/billing/invoices/[id]/page.tsx`). No standalone detail route
 * exists for a single credit note in this pass — every action this
 * document's lifecycle needs happens inline here, matching this codebase's
 * own precedent of scoping small contextual documents to their parent
 * page's table rather than giving every entity its own `[id]/page.tsx`.
 */
export function CreditNotesTable({
  notes,
  invoiceId,
  studentId,
}: {
  notes: CreditNoteResponseDto[];
  invoiceId: string;
  studentId: string | undefined;
}) {
  const t = useTranslations("billing.creditNotes.table");
  const tCommon = useTranslations("common");

  const columns = React.useMemo<ColumnDef<CreditNoteResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("number") },
      { accessorKey: "reason", header: t("reason") },
      {
        id: "status",
        header: t("status"),
        cell: ({ row }) => <CreditNoteStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "total",
        header: t("total"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => <CreditNoteStatusActions note={row.original} invoiceId={invoiceId} studentId={studentId} />,
      },
    ],
    [t, tCommon, invoiceId, studentId],
  );

  return <DataTable columns={columns} data={notes} />;
}
