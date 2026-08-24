"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStudent } from "@/features/students/hooks/use-students";
import { useTerm } from "@/features/settings/hooks/use-academic-calendar";
import { formatMoney } from "@/lib/money";
import { parseLateFeeBatchSummary, type LateFeeBatchSummaryEntry } from "../api/late-fee-batches.api";

/**
 * Renders the REAL `LateFeeBatchResponseDto.summary` breakdown — a real
 * per-student/per-invoice table, not a bare total (see
 * `late-fee-batches.api.ts`'s own `parseLateFeeBatchSummary()` doc comment
 * for the confirmed shape, read directly off `LateFeeBatchesService`'s own
 * exported `LateFeeBatchSummary` interface). One card per `(studentId,
 * termId)` entry — the same grouping the service itself uses, since a
 * student with overdue invoices spanning two different terms gets two
 * separate entries here, each generating its own late-fee invoice at
 * `post()` time — with a nested table of that entry's own per-invoice
 * `daysOverdue`/`amount` breakdown.
 *
 * Student/term names are resolved per entry via the already-existing
 * `useStudent()`/`useTerm()` hooks (`features/students/hooks/use-students.ts`,
 * `features/settings/hooks/use-academic-calendar.ts`) — the SAME per-row
 * cross-feature resolution pattern `BulkAllocationLineStudentCell`
 * (`features/payments/components/bulk-allocation-line-student-cell.tsx`)
 * already established for exactly this "a batch response only carries raw
 * ids" shape: one cached fetch per distinct id, not re-fetched per row that
 * happens to share one.
 */
export function LateFeeBatchSummaryTable({ summary }: { summary: Record<string, unknown> }) {
  const t = useTranslations("billing.lateFeeBatches.summaryTable");
  const parsed = parseLateFeeBatchSummary(summary);

  if (parsed.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-border px-4 py-3 text-sm">
        <div>
          <span className="text-muted-foreground">{t("totalAssessedLabel")}: </span>
          <span className="font-medium text-foreground">{formatMoney(parsed.totalAssessed)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("studentCountLabel")}: </span>
          <span className="font-medium text-foreground">{parsed.studentCount}</span>
        </div>
      </div>

      {parsed.entries.map((entry, index) => (
        <SummaryEntryCard key={`${entry.studentId}-${entry.termId}-${index}`} entry={entry} />
      ))}
    </div>
  );
}

function SummaryEntryCard({ entry }: { entry: LateFeeBatchSummaryEntry }) {
  const t = useTranslations("billing.lateFeeBatches.summaryTable");
  const studentQuery = useStudent(entry.studentId);
  const termQuery = useTerm(entry.termId);

  const studentLabel = studentQuery.data
    ? `${studentQuery.data.firstName} ${studentQuery.data.lastName} — ${studentQuery.data.admissionNo}`
    : `${entry.studentId.slice(0, 8)}…`;
  const termLabel = termQuery.data?.name ?? `${entry.termId.slice(0, 8)}…`;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 px-4 py-2.5">
        <div className="space-y-0.5">
          <Link href={`/students/${entry.studentId}`} className="text-sm font-medium text-primary hover:underline">
            {studentLabel}
          </Link>
          <p className="text-xs text-muted-foreground">
            {t("termLabel")}: {termLabel}
          </p>
        </div>
        <span className="text-sm font-semibold text-foreground">{formatMoney(entry.amount)}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("invoiceIdColumn")}</TableHead>
            <TableHead>{t("daysOverdueColumn")}</TableHead>
            <TableHead>{t("amountColumn")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entry.invoices.map((invoice) => (
            <TableRow key={invoice.invoiceId}>
              <TableCell>
                <Link href={`/billing/invoices/${invoice.invoiceId}`} className="text-primary hover:underline">
                  {invoice.invoiceId.slice(0, 8)}…
                </Link>
              </TableCell>
              <TableCell>{invoice.daysOverdue}</TableCell>
              <TableCell>{formatMoney(invoice.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
