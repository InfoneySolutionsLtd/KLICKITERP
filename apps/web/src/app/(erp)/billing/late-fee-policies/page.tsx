"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { LateFeePolicyResponseDto } from "@klickit/contracts";
import { Eye, Plus } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RowActionButton } from "@/components/ui/row-action-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useLateFeePolicies } from "@/features/billing/hooks/use-late-fee-policies";
import { LateFeePolicyDialog } from "@/features/billing/components/late-fee-policy-dialog";

const MODE_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  FLAT: "soft-secondary",
  PERCENT: "soft-secondary",
  TIERED: "soft-secondary",
};

/**
 * Late Fee Policies list — the newer "real list+detail pair" nav convention
 * (not Fee Categories' own older list-only precedent): a plain `<DataTable>`
 * inside `<QueryBoundary>` (`LateFeePoliciesController.list()` takes zero
 * query params, confirmed by reading the controller directly — no filter
 * bar), `onRowClick` + a per-row `View` button (`e.stopPropagation()` before
 * navigating) matching `accounting/budgets/page.tsx`'s established pattern.
 * Edit/activate/deactivate live on the detail page, not here — this list is
 * create + browse only.
 */
export default function LateFeePoliciesPage() {
  const t = useTranslations("billing.lateFeePolicies.list");
  const tModes = useTranslations("billing.lateFeePolicies.modeValues");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const policiesQuery = useLateFeePolicies();
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);

  const columns = React.useMemo<ColumnDef<LateFeePolicyResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name") },
      {
        id: "mode",
        header: t("columns.mode"),
        cell: ({ row }) => <Badge variant={MODE_BADGE_VARIANT[row.original.mode] ?? "outline"}>{tModes(row.original.mode)}</Badge>,
      },
      { accessorKey: "graceDays", header: t("columns.graceDays") },
      {
        id: "requiresApproval",
        header: t("columns.requiresApproval"),
        cell: ({ row }) => (row.original.requiresApproval ? tCommon("active") : "—"),
      },
      {
        id: "isActive",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "soft-success" : "soft-destructive"}>
            {row.original.isActive ? tCommon("active") : tCommon("inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <RowActionButton
            tone="view"
            label={tCommon("view")}
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/billing/late-fee-policies/${row.original.id}`);
            }}
          >
            <Eye />
          </RowActionButton>
        ),
      },
    ],
    [t, tModes, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="size-4" />
          {t("newPolicy")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={policiesQuery} isEmpty={(d) => d.length === 0}>
            {(policies) => (
              <DataTable columns={columns} data={policies} onRowClick={(policy) => router.push(`/billing/late-fee-policies/${policy.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>

      <LateFeePolicyDialog mode="create" open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  );
}
