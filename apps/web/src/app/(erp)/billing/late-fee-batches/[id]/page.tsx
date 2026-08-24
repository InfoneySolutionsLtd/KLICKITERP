"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { LateFeeBatchResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useLateFeePolicy } from "@/features/billing/hooks/use-late-fee-policies";
import { useLateFeeBatch } from "@/features/billing/hooks/use-late-fee-batches";
import { LateFeeBatchSummaryTable } from "@/features/billing/components/late-fee-batch-summary-table";
import { LateFeeBatchStatusActions } from "@/features/billing/components/late-fee-batch-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  POSTED: "soft-success",
};

/**
 * A late-fee batch's detail page: header `Card` (run date, status badge,
 * which policy it belongs to — name + link back,
 * `<LateFeeBatchStatusActions>`) + a summary `Card`
 * (`<LateFeeBatchSummaryTable>`, the real per-student/per-invoice
 * breakdown). Same `useParams<{id:string}>()` + `<QueryBoundary>`
 * header-card shape `accounting/budgets/[id]/page.tsx`/
 * `billing/late-fee-policies/[id]/page.tsx` already establish.
 *
 * The owning policy is resolved via `useLateFeePolicy()` (the already-live
 * Part 2 single-get hook) purely so `<LateFeeBatchStatusActions>` can read
 * its real `requiresApproval` flag — `LateFeeBatchResponseDto` itself only
 * carries `policyId`, no denormalized copy of the policy's own fields.
 */
export default function LateFeeBatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("billing.lateFeeBatches.detail");
  const batchQuery = useLateFeeBatch(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/billing/late-fee-batches">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={batchQuery}>{(batch) => <BatchDetailCard batch={batch} />}</QueryBoundary>
    </div>
  );
}

function BatchDetailCard({ batch }: { batch: LateFeeBatchResponseDto }) {
  const t = useTranslations("billing.lateFeeBatches.detail");
  const tStatuses = useTranslations("billing.lateFeeBatches.statusValues");
  const policyQuery = useLateFeePolicy(batch.policyId);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{t("batchTitle", { runDate: batch.runDate })}</CardTitle>
              <Badge variant={STATUS_BADGE_VARIANT[batch.status] ?? "outline"}>{tStatuses(batch.status)}</Badge>
            </div>
            <CardDescription>
              {t("policyLabel")}:{" "}
              <Link href={`/billing/late-fee-policies/${batch.policyId}`} className="text-primary hover:underline">
                {policyQuery.data?.name ?? batch.policyId}
              </Link>
            </CardDescription>
          </div>
          {policyQuery.data && <LateFeeBatchStatusActions batch={batch} requiresApproval={policyQuery.data.requiresApproval} />}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LateFeeBatchSummaryTable summary={batch.summary} />
        </CardContent>
      </Card>
    </>
  );
}
