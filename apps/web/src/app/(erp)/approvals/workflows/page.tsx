"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { RowActionButton } from "@/components/ui/row-action-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import type { WorkflowDef } from "@/features/approvals/types";
import { useWorkflowDefinitions } from "@/features/approvals/hooks/use-workflow-definitions";
import { CreateWorkflowDefinitionDialog } from "@/features/approvals/components/create-workflow-definition-dialog";
import { EditWorkflowDefinitionDialog } from "@/features/approvals/components/edit-workflow-definition-dialog";

/**
 * Approvals workflow admin — list of `appr_workflow_def` rows. Direct
 * structural mirror of `app/(erp)/roles/page.tsx` (Card + client-side
 * substring search + `<DataTable>` in `<QueryBoundary>`, header create
 * dialog, per-row edit dialog, row click -> detail). `GET /approvals/
 * workflow-definitions` is unpaginated (confirmed by reading
 * `WorkflowDefinitionsController` directly) — a small, bounded dataset (the
 * real seed data ships 24 rows, one per already-wired business domain code),
 * same "small, unbounded dataset" shape Roles' own list already established.
 */
export default function WorkflowDefinitionsPage() {
  const t = useTranslations("approvals.workflows.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const defsQuery = useWorkflowDefinitions();
  const [search, setSearch] = React.useState("");

  const filterDefs = React.useCallback(
    (defs: WorkflowDef[]) => {
      const term = search.trim().toLowerCase();
      if (!term) return defs;
      return defs.filter((d) => d.domainCode.toLowerCase().includes(term) || d.name.toLowerCase().includes(term));
    },
    [search],
  );

  const columns = React.useMemo<ColumnDef<WorkflowDef>[]>(
    () => [
      {
        id: "domainCode",
        header: t("columns.domainCode"),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.domainCode}</span>,
      },
      { accessorKey: "name", header: t("columns.name") },
      {
        id: "isActive",
        header: t("columns.status"),
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="soft-success">{t("statusActive")}</Badge>
          ) : (
            <Badge variant="soft-secondary">{t("statusInactive")}</Badge>
          ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <RowActionButton tone="view" label={tCommon("view")} onClick={() => router.push(`/approvals/workflows/${row.original.id}`)}>
              <Eye />
            </RowActionButton>
            <EditWorkflowDefinitionDialog workflowDef={row.original} />
          </div>
        ),
      },
    ],
    [t, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateWorkflowDefinitionDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <QueryBoundary query={defsQuery} isEmpty={(d) => d.length === 0}>
            {(defs) => {
              const filtered = filterDefs(defs);
              return filtered.length === 0 && search.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noResultsMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={filtered} onRowClick={(d) => router.push(`/approvals/workflows/${d.id}`)} />
              );
            }}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
