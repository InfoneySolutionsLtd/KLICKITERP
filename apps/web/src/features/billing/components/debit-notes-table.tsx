"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { DebitNoteResponseDto } from "@klickit/contracts";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { listTerms } from "../api/academic-calendar.api";
import { DebitNoteStatusBadge } from "./status-badges";
import { DebitNoteStatusActions } from "./debit-note-status-actions";

/**
 * `GET /billing/debit-notes?studentId=` has no term filter server-side
 * (`debit-notes.api.ts`'s own doc comment) — this table therefore shows
 * EVERY debit note ever raised for the student, across every academic
 * year/term, with its own Term column rather than a client-side term filter
 * (the plan's own "simplest, matches what the backend actually supports"
 * scope decision).
 *
 * The term-name lookup below calls `listTerms()` with NO `academicYearId` —
 * an unscoped fetch `academic-calendar.api.ts`'s `listTerms()` already
 * supports (its param is optional) — rather than `use-academic-calendar.ts`'s
 * own `useTerms(academicYearId)`, which REQUIRES one and would need each
 * term's year known up front: exactly the thing this table can't assume
 * across debit notes that may span different years. Defined locally (not
 * added to the shared hooks file) since this is the only caller that needs
 * an unscoped list.
 */
function useAllTerms() {
  return useQuery({
    queryKey: ["billing", "terms", "all"] as const,
    queryFn: () => listTerms(),
  });
}

export function DebitNotesTable({ notes, studentId }: { notes: DebitNoteResponseDto[]; studentId: string | undefined }) {
  const t = useTranslations("billing.debitNotes.table");
  const tCommon = useTranslations("common");
  const termsQuery = useAllTerms();

  const termNameById = React.useMemo(() => new Map((termsQuery.data ?? []).map((term) => [term.id, term.name])), [termsQuery.data]);

  const columns = React.useMemo<ColumnDef<DebitNoteResponseDto>[]>(
    () => [
      { accessorKey: "number", header: t("number") },
      {
        id: "term",
        header: t("term"),
        cell: ({ row }) => (row.original.termId ? termNameById.get(row.original.termId) ?? row.original.termId : "—"),
      },
      { accessorKey: "reason", header: t("reason") },
      {
        id: "status",
        header: t("status"),
        cell: ({ row }) => <DebitNoteStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "total",
        header: t("total"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => <DebitNoteStatusActions note={row.original} studentId={studentId} />,
      },
    ],
    [t, tCommon, termNameById, studentId],
  );

  return <DataTable columns={columns} data={notes} />;
}
