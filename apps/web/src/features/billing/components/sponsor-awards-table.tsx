"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { SponsorAwardResponseDto } from "@klickit/contracts";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney, sumMoneyStrings } from "@/lib/money";
import { useSponsors } from "../hooks/use-sponsors";
import { useAllTerms } from "../hooks/use-academic-calendar";

/**
 * Negates a `Money`-shaped decimal string by flipping its leading sign — the
 * same tiny local helper `features/payments/lib/balance.ts` established for
 * a one-off "subtract" need (see that file's own doc comment on why a
 * second shared subtract function in `lib/money.ts` isn't warranted for a
 * single call site). Reused here rather than duplicated, would be the ideal
 * if this were a cross-feature concern, but it's Payments-local — this is
 * its Billing-local twin.
 */
function negateDecimalString(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

/**
 * `amount - appliedAmount`, computed via `sumMoneyStrings`'s own BigInt
 * scaled-arithmetic technique (`lib/money.ts`) — never `parseFloat` on a
 * money value, this app's standing discipline. This is the one figure
 * `SponsorAwardResponseDto` doesn't already carry directly: how much of the
 * award's total capacity hasn't been swept into an invoice yet.
 */
function remainingBalance(amount: string, appliedAmount: string): string {
  return sumMoneyStrings([amount, negateDecimalString(appliedAmount)]);
}

/**
 * Part 3 (Billing sub-features batch) — read-only listing of a student's
 * sponsor awards on the student detail page. `sponsorId`/`termId` are
 * resolved to display names via the already-loaded `useSponsors()` list and
 * a new unscoped `useAllTerms()` (`use-academic-calendar.ts`) — the same
 * `Map`-from-loaded-list technique `OpenInvoicesTable` uses for `classId`
 * and `FeeStructureLinesTable` uses for `termId`/`feeCategoryId`, not a
 * per-row fetch.
 *
 * There is no "apply" action anywhere in this table by design:
 * `appliedAmount` is incremented automatically and silently by the
 * backend's own Step 3 sponsor-award sweep every time an invoice for this
 * student+term posts (`sponsor-awards.api.ts`'s own doc comment) — the note
 * above the table states that plainly so nobody goes looking for a control
 * that was never going to exist.
 */
export function SponsorAwardsTable({ awards }: { awards: SponsorAwardResponseDto[] }) {
  const t = useTranslations("billing.sponsorAwards.table");
  const sponsorsQuery = useSponsors();
  const termsQuery = useAllTerms();

  const sponsorNameById = React.useMemo(() => new Map((sponsorsQuery.data ?? []).map((s) => [s.id, s.name])), [sponsorsQuery.data]);
  const termNameById = React.useMemo(() => new Map((termsQuery.data ?? []).map((term) => [term.id, term.name])), [termsQuery.data]);

  const columns = React.useMemo<ColumnDef<SponsorAwardResponseDto>[]>(
    () => [
      {
        id: "sponsor",
        header: t("sponsor"),
        cell: ({ row }) => sponsorNameById.get(row.original.sponsorId) ?? row.original.sponsorId,
      },
      {
        id: "term",
        header: t("term"),
        cell: ({ row }) => termNameById.get(row.original.termId) ?? row.original.termId,
      },
      {
        accessorKey: "amount",
        header: t("amount"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      {
        accessorKey: "appliedAmount",
        header: t("appliedAmount"),
        cell: ({ getValue }) => formatMoney(getValue<string>()),
      },
      {
        id: "remaining",
        header: t("remaining"),
        cell: ({ row }) => <span className="font-medium">{formatMoney(remainingBalance(row.original.amount, row.original.appliedAmount))}</span>,
      },
    ],
    [t, sponsorNameById, termNameById],
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("appliesAutomaticallyNote")}</p>
      <DataTable columns={columns} data={awards} />
    </div>
  );
}
