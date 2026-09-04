"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import type { WorkflowVersion } from "@/features/approvals/types";
import { useWorkflowDefinition } from "@/features/approvals/hooks/use-workflow-definitions";
import { useSetCurrentWorkflowVersion, useWorkflowVersions } from "@/features/approvals/hooks/use-workflow-versions";
import { EditWorkflowDefinitionDialog } from "@/features/approvals/components/edit-workflow-definition-dialog";

/**
 * Workflow definition detail — header Card (fields + edit) + a Versions
 * Card (version history, newest first per the backend's own ordering, a
 * "Set as Current" row action, and a "Publish New Version" button linking to
 * the builder page). No add/remove-row editing lives here — see
 * `versions/new/page.tsx`'s own doc comment for why. `WorkflowDefResponseDto.version`
 * is never shown here — it's an unrelated optimistic-lock counter, not the
 * real published version number (that comes from THIS card's own `isCurrent`
 * row).
 */
export default function WorkflowDefinitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("approvals.workflows");
  const defQuery = useWorkflowDefinition(id);
  const versionsQuery = useWorkflowVersions(id);
  const setCurrentMutation = useSetCurrentWorkflowVersion(id);
  const router = useRouter();

  const columns: ColumnDef<WorkflowVersion>[] = [
    { id: "version", header: t("detail.columns.version"), cell: ({ row }) => `v${row.original.version}` },
    {
      id: "isCurrent",
      header: t("detail.columns.status"),
      cell: ({ row }) =>
        row.original.isCurrent ? <Badge variant="soft-success">{t("detail.currentBadge")}</Badge> : <Badge variant="soft-secondary">{t("detail.supersededBadge")}</Badge>,
    },
    {
      id: "createdAt",
      header: t("detail.columns.createdAt"),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
    {
      id: "actions",
      header: t("detail.columns.actions"),
      cell: ({ row }) =>
        !row.original.isCurrent ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={setCurrentMutation.isPending}
              onClick={() => setCurrentMutation.mutate(row.original.id)}
            >
              {t("detail.setCurrentAction")}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/approvals/workflows">
          <ArrowLeft className="size-4" />
          {t("detail.backToList")}
        </Link>
      </Button>

      <QueryBoundary query={defQuery}>
        {(workflowDef) => (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="text-base text-foreground">{workflowDef.name}</CardTitle>
                <CardDescription className="font-mono text-xs">{workflowDef.domainCode}</CardDescription>
                {workflowDef.isActive ? (
                  <Badge variant="soft-success">{t("list.statusActive")}</Badge>
                ) : (
                  <Badge variant="soft-secondary">{t("list.statusInactive")}</Badge>
                )}
              </div>
              <EditWorkflowDefinitionDialog workflowDef={workflowDef} />
            </CardHeader>
          </Card>
        )}
      </QueryBoundary>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base text-foreground">{t("detail.versionsTitle")}</CardTitle>
            <CardDescription>{t("detail.versionsDescription")}</CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => router.push(`/approvals/workflows/${id}/versions/new`)}>
            <Plus className="size-4" />
            {t("detail.publishNewVersionAction")}
          </Button>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={versionsQuery} isEmpty={(d) => d.length === 0}>
            {(versions) => (
              <DataTable columns={columns} data={versions} onRowClick={(v) => router.push(`/approvals/workflows/${id}/versions/${v.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
