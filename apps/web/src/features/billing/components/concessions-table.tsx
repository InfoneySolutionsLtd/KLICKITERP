"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { ConcessionResponseDto, InvoiceResponseDto } from "@klickit/contracts";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { ConcessionStatusBadge } from "./status-badges";
import { ConcessionStatusActions } from "./concession-status-actions";
import { PostStandaloneConcessionButton } from "./post-standalone-concession-button";
import { useConcessionSchemes } from "../hooks/use-concession-schemes";
import { useSponsorAwardsForStudent } from "../hooks/use-sponsor-awards";
import { useSponsors } from "../hooks/use-sponsors";

/**
 * Part 4 (Billing sub-features batch) — reusable across both the
 * student-scoped Card (`students/[id]/page.tsx`) and the invoice-scoped
 * section (`billing/invoices/[id]/page.tsx`), matching `CreditNotesTable`'s
 * own precedent of one shared table component for a contextual document with
 * no standalone detail route.
 *
 * Every concession in a single render of this table shares one real
 * `studentId` — either the page's own student (student-scoped surface), or
 * the one student the current invoice belongs to (invoice-scoped surface,
 * always `invoice.studentId` since a `bill_concession` row's own
 * `studentId` must match its target invoice's owner) — so a single
 * `studentId` prop resolves every row's sponsor-award label via one
 * `useSponsorAwardsForStudent()` call, the same `Map`-from-loaded-list
 * technique `SponsorAwardsTable` already uses, not a per-row fetch.
 *
 * `invoice` is only ever supplied by the invoice-scoped caller — when
 * present, `PostStandaloneConcessionButton` renders per row alongside
 * `ConcessionStatusActions` (itself gated to APPROVED-and-not-DRAFT, see
 * that component's own doc comment); the student-scoped caller omits
 * `invoice` entirely, matching the plan's "no post-standalone button on
 * this surface."
 */
export function ConcessionsTable({
  concessions,
  studentId,
  invoice,
}: {
  concessions: ConcessionResponseDto[];
  studentId: string;
  invoice?: InvoiceResponseDto;
}) {
  const t = useTranslations("billing.concessions.table");
  const tKinds = useTranslations("billing.concessions.dialog.kindValues");
  const tCommon = useTranslations("common");

  const schemesQuery = useConcessionSchemes();
  const sponsorAwardsQuery = useSponsorAwardsForStudent(studentId);
  const sponsorsQuery = useSponsors();

  const schemeNameById = React.useMemo(() => new Map((schemesQuery.data ?? []).map((s) => [s.id, s.name])), [schemesQuery.data]);
  const sponsorAwardById = React.useMemo(
    () => new Map((sponsorAwardsQuery.data ?? []).map((a) => [a.id, a])),
    [sponsorAwardsQuery.data],
  );
  const sponsorNameById = React.useMemo(() => new Map((sponsorsQuery.data ?? []).map((s) => [s.id, s.name])), [sponsorsQuery.data]);

  const targetLabel = React.useCallback(
    (concession: ConcessionResponseDto): string => {
      if (concession.schemeId) {
        return schemeNameById.get(concession.schemeId) ?? concession.schemeId;
      }
      if (concession.sponsorAwardId) {
        const award = sponsorAwardById.get(concession.sponsorAwardId);
        const sponsorName = award ? (sponsorNameById.get(award.sponsorId) ?? award.sponsorId) : concession.sponsorAwardId;
        return t("sponsorAwardLabel", { sponsor: sponsorName });
      }
      return "—";
    },
    [schemeNameById, sponsorAwardById, sponsorNameById, t],
  );

  const columns = React.useMemo<ColumnDef<ConcessionResponseDto>[]>(
    () => [
      {
        id: "kind",
        header: t("kind"),
        cell: ({ row }) => tKinds(row.original.kind),
      },
      {
        id: "target",
        header: t("target"),
        cell: ({ row }) => targetLabel(row.original),
      },
      {
        accessorKey: "amount",
        header: t("amount"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      { accessorKey: "reason", header: t("reason") },
      {
        id: "status",
        header: t("status"),
        cell: ({ row }) => <ConcessionStatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <ConcessionStatusActions concession={row.original} />
            {invoice && <PostStandaloneConcessionButton concession={row.original} invoice={invoice} />}
          </div>
        ),
      },
    ],
    [t, tKinds, tCommon, invoice, targetLabel],
  );

  return <DataTable columns={columns} data={concessions} />;
}
