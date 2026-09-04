"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { PromotionBatchResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useAcademicYears } from "@/features/billing/hooks/use-academic-calendar";
import { usePromotionBatch } from "@/features/students/hooks/use-promotion-batches";
import { PromotionBatchSummaryTable } from "@/features/students/components/promotion-batch-summary-table";

/**
 * Promotion batch detail — mirrors `late-fee-batches/[id]/page.tsx`'s shape
 * minus any status badge or approve/reject actions (this resource has
 * neither, see `promotion-batches.api.ts`'s own doc comment: no status
 * field, no Approvals-engine integration).
 */
export default function PromotionBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("students.promotionBatches.detail");
  const batchQuery = usePromotionBatch(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/students/promotion-batches">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={batchQuery}>{(batch) => <BatchDetailCard batch={batch} />}</QueryBoundary>
    </div>
  );
}

function BatchDetailCard({ batch }: { batch: PromotionBatchResponseDto }) {
  const t = useTranslations("students.promotionBatches.detail");
  const academicYearsQuery = useAcademicYears();
  const yearNameById = new Map((academicYearsQuery.data ?? []).map((y) => [y.id, y.name]));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">
            {t("batchTitle", { fromYear: yearNameById.get(batch.fromYearId) ?? batch.fromYearId, toYear: yearNameById.get(batch.toYearId) ?? batch.toYearId })}
          </CardTitle>
          <CardDescription>{t("executedAtLabel")}: {new Date(batch.executedAt).toLocaleString()}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PromotionBatchSummaryTable summary={batch.summary} />
        </CardContent>
      </Card>
    </>
  );
}
