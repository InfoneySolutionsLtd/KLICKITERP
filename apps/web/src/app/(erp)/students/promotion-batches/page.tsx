"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PromotionBatchResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useAcademicYears } from "@/features/billing/hooks/use-academic-calendar";
import { parsePromotionBatchSummary } from "@/features/students/api/promotion-batches.api";
import { usePromotionBatches } from "@/features/students/hooks/use-promotion-batches";

/**
 * Promotion batches list — every batch that has ever run (there is no
 * status field and no draft/preview state, see `promotion-batches.api.ts`'s
 * own doc comment: a batch either ran, atomically, or doesn't exist).
 * `GET /students/promotion-batches` has no filters (confirmed by reading
 * `PromotionController` directly) — a small, infrequent-operation dataset,
 * same "small, unbounded dataset" shape Roles/Delegations' own lists
 * already establish, sorted newest-first client-side.
 */
export default function PromotionBatchesPage() {
  const t = useTranslations("students.promotionBatches.list");
  const router = useRouter();
  const batchesQuery = usePromotionBatches();
  const academicYearsQuery = useAcademicYears();

  const yearNameById = React.useMemo(() => new Map((academicYearsQuery.data ?? []).map((y) => [y.id, y.name])), [academicYearsQuery.data]);

  const columns = React.useMemo<ColumnDef<PromotionBatchResponseDto>[]>(
    () => [
      { id: "fromYear", header: t("columns.fromYear"), cell: ({ row }) => yearNameById.get(row.original.fromYearId) ?? row.original.fromYearId },
      { id: "toYear", header: t("columns.toYear"), cell: ({ row }) => yearNameById.get(row.original.toYearId) ?? row.original.toYearId },
      { id: "executedAt", header: t("columns.executedAt"), cell: ({ row }) => new Date(row.original.executedAt).toLocaleString() },
      {
        id: "results",
        header: t("columns.results"),
        cell: ({ row }) => {
          const summary = parsePromotionBatchSummary(row.original.summary);
          return t("resultsSummary", { promoted: summary.promotedCount, failed: summary.failedCount });
        },
      },
    ],
    [t, yearNameById],
  );

  const sortedBatches = React.useMemo(
    () => [...(batchesQuery.data ?? [])].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()),
    [batchesQuery.data],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/students/promotion-batches/new">
            <Plus className="size-4" />
            {t("newBatchAction")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={batchesQuery} isEmpty={(d) => d.length === 0}>
            {() => <DataTable columns={columns} data={sortedBatches} onRowClick={(b) => router.push(`/students/promotion-batches/${b.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
