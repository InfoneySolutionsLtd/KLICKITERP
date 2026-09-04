"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStudent } from "@/features/students/hooks/use-students";
import { parsePromotionBatchSummary, type PromotionFailure } from "../api/promotion-batches.api";

/**
 * Renders `PromotionBatchResponseDto.summary` — stat tiles
 * (totalRequested/promotedCount/failedCount) plus a per-failure table when
 * any exist. There is no list of successfully-promoted students anywhere in
 * this shape (only a count — see `promotion-batches.api.ts`'s own doc
 * comment), so unlike `LateFeeBatchSummaryTable` this never lists individual
 * successes, only failures (student name resolved per row via the existing
 * `useStudent()` hook, same per-row cross-feature resolution pattern that
 * table already establishes).
 */
export function PromotionBatchSummaryTable({ summary }: { summary: Record<string, unknown> }) {
  const t = useTranslations("students.promotionBatches.summaryTable");
  const parsed = parsePromotionBatchSummary(summary);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-border px-4 py-3 text-sm">
        <div>
          <span className="text-muted-foreground">{t("totalRequestedLabel")}: </span>
          <span className="font-medium text-foreground">{parsed.totalRequested}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("promotedCountLabel")}: </span>
          <span className="font-medium text-success">{parsed.promotedCount}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("failedCountLabel")}: </span>
          <span className={parsed.failedCount > 0 ? "font-medium text-warning" : "font-medium text-foreground"}>{parsed.failedCount}</span>
        </div>
      </div>

      {parsed.failures.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("studentColumn")}</TableHead>
                <TableHead>{t("reasonColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsed.failures.map((failure, index) => (
                <FailureRow key={`${failure.studentId}-${index}`} failure={failure} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function FailureRow({ failure }: { failure: PromotionFailure }) {
  const studentQuery = useStudent(failure.studentId);
  const label = studentQuery.data ? `${studentQuery.data.firstName} ${studentQuery.data.lastName}` : `${failure.studentId.slice(0, 8)}…`;

  return (
    <TableRow>
      <TableCell>
        <Link href={`/students/${failure.studentId}`} className="text-primary hover:underline">
          {label}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{failure.reason}</TableCell>
    </TableRow>
  );
}
