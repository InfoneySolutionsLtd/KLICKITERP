"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { LateFeeBatchResponseDto } from "@klickit/contracts";
import { Eye } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useLateFeePolicies } from "@/features/billing/hooks/use-late-fee-policies";
import { useLateFeeBatches } from "@/features/billing/hooks/use-late-fee-batches";
import { parseLateFeeBatchSummary } from "@/features/billing/api/late-fee-batches.api";
import { RunLateFeeBatchDialog } from "@/features/billing/components/run-late-fee-batch-dialog";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  POSTED: "soft-success",
};

/**
 * Late Fee Batches list — policy-scoped, per `LateFeeBatchesController.list()`'s
 * own real signature (`@Query("policyId") policyId: string`, required — no
 * default, confirmed by reading the controller directly), mirroring
 * `accounting/budgets/page.tsx`'s "select a scope first" shape exactly: a
 * policy `<Select>` (`useLateFeePolicies()`, the already-live Part 2 hook)
 * is this page's own first-class control, not an optional filter — the
 * table area shows a prompt instead of a table until one is picked, and
 * `<RunLateFeeBatchDialog>`'s trigger only renders once one is (it needs a
 * real `policyId`).
 *
 * "Total assessed" / "Students" columns read `row.original.summary` through
 * `parseLateFeeBatchSummary()` — the batch list response already carries
 * the full summary per row, no extra round trip needed to show these.
 */
export default function LateFeeBatchesPage() {
  const t = useTranslations("billing.lateFeeBatches.list");
  const tStatuses = useTranslations("billing.lateFeeBatches.statusValues");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [policyId, setPolicyId] = React.useState("");
  const policiesQuery = useLateFeePolicies();
  const batchesQuery = useLateFeeBatches(policyId || undefined);

  const columns = React.useMemo<ColumnDef<LateFeeBatchResponseDto>[]>(
    () => [
      { accessorKey: "runDate", header: t("columns.runDate") },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
      {
        id: "totalAssessed",
        header: t("columns.totalAssessed"),
        cell: ({ row }) => formatMoney(parseLateFeeBatchSummary(row.original.summary).totalAssessed),
      },
      {
        id: "studentCount",
        header: t("columns.studentCount"),
        cell: ({ row }) => parseLateFeeBatchSummary(row.original.summary).studentCount,
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/billing/late-fee-batches/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tStatuses, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        {policyId && <RunLateFeeBatchDialog policyId={policyId} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-64 space-y-1.5">
            <Label>{t("policyLabel")}</Label>
            <Select value={policyId} onValueChange={setPolicyId} disabled={policiesQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectPolicyPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(policiesQuery.data ?? []).map((policy) => (
                  <SelectItem key={policy.id} value={policy.id}>
                    {policy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {policyId ? (
            <QueryBoundary query={batchesQuery} isEmpty={(d) => d.length === 0}>
              {(batches) => (
                <DataTable columns={columns} data={batches} onRowClick={(row) => router.push(`/billing/late-fee-batches/${row.id}`)} />
              )}
            </QueryBoundary>
          ) : (
            <p className="text-sm text-muted-foreground">{t("selectPolicyPrompt")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
