"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { SavedParamsResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useReportCatalogue } from "@/features/reports/hooks/use-catalogue";
import { useMySavedParams } from "@/features/reports/hooks/use-saved-params";
import { RenameSavedParamsDialog } from "@/features/reports/components/rename-saved-params-dialog";
import { DeleteSavedParamsButton } from "@/features/reports/components/delete-saved-params-button";

export default function SavedReportsPage() {
  const t = useTranslations("reports.saved");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const savedQuery = useMySavedParams();
  const catalogueQuery = useReportCatalogue();

  const reportNameByCode = React.useMemo(
    () => new Map((catalogueQuery.data ?? []).map((r) => [r.code, r.name])),
    [catalogueQuery.data],
  );

  const columns = React.useMemo<ColumnDef<SavedParamsResponseDto>[]>(
    () => [
      { id: "report", header: t("columns.report"), cell: ({ row }) => reportNameByCode.get(row.original.reportCode) ?? row.original.reportCode },
      { accessorKey: "name", header: t("columns.name") },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => router.push(`/reports/${row.original.reportCode}?savedParamsId=${row.original.id}`)}>
              {t("loadAction")}
            </Button>
            <RenameSavedParamsDialog savedParams={row.original} />
            <DeleteSavedParamsButton savedParams={row.original} />
          </div>
        ),
      },
    ],
    [t, tCommon, reportNameByCode, router],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={savedQuery} isEmpty={(d) => d.length === 0}>
            {(rows) => <DataTable columns={columns} data={rows} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
