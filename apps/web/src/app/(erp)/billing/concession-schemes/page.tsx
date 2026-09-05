"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { ConcessionSchemeResponseDto } from "@klickit/contracts";
import { Eye, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RowActionButton } from "@/components/ui/row-action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useConcessionSchemes } from "@/features/billing/hooks/use-concession-schemes";
import { ConcessionSchemeDialog } from "@/features/billing/components/concession-scheme-dialog";

/**
 * Part 1 (Billing sub-features batch) — the Concession Schemes list: a plain
 * `<DataTable>` inside `<QueryBoundary>` + a create dialog, following the
 * codebase-wide "clickable row + explicit View button, button stops
 * propagation" convention (`accounting/budgets/page.tsx`, ~39 other list
 * pages) rather than Fee Categories' own older list-only shape — this
 * module gets a real list+detail pair per the plan's own instruction.
 */
export default function ConcessionSchemesPage() {
  const t = useTranslations("billing.concessionSchemes");
  const tKinds = useTranslations("billing.concessionSchemes.kindValues");
  const tCalcs = useTranslations("billing.concessionSchemes.calcValues");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const schemesQuery = useConcessionSchemes();
  const [createOpen, setCreateOpen] = React.useState(false);

  const columns = React.useMemo<ColumnDef<ConcessionSchemeResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("table.name") },
      { id: "kind", header: t("table.kind"), cell: ({ row }) => tKinds(row.original.kind) },
      { id: "calc", header: t("table.calc"), cell: ({ row }) => tCalcs(row.original.calc) },
      { accessorKey: "value", header: t("table.value") },
      {
        id: "isActive",
        header: t("table.status"),
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
              router.push(`/billing/concession-schemes/${row.original.id}`);
            }}
          >
            <Eye />
          </RowActionButton>
        ),
      },
    ],
    [t, tKinds, tCalcs, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t("newScheme")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={schemesQuery} isEmpty={(d) => d.length === 0}>
            {(schemes) => (
              <DataTable
                columns={columns}
                data={schemes}
                onRowClick={(scheme) => router.push(`/billing/concession-schemes/${scheme.id}`)}
              />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>

      <ConcessionSchemeDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
