"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useReportCatalogue } from "@/features/reports/hooks/use-catalogue";
import { useMySchedules } from "@/features/reports/hooks/use-schedules";
import { scheduleLastOk, scheduleRecipients, type ScheduleResponseDto } from "@/features/reports/api/schedules.api";
import { EditScheduleDialog } from "@/features/reports/components/edit-schedule-dialog";
import { DeleteScheduleButton } from "@/features/reports/components/delete-schedule-button";
import { RunSchedulesDueButton } from "@/features/reports/components/run-schedules-due-button";

/**
 * Same shape `expenses/recurring/page.tsx` already establishes: `<RunSchedulesDueButton>`
 * rendered right next to the page title, equally prominent — it's the ONLY
 * thing that ever fires a schedule (no cron/worker process exists anywhere
 * in this codebase, see that button's own doc comment).
 */
export default function ReportSchedulesPage() {
  const t = useTranslations("reports.schedules");
  const tCommon = useTranslations("common");

  const schedulesQuery = useMySchedules();
  const catalogueQuery = useReportCatalogue();

  const reportNameByCode = React.useMemo(
    () => new Map((catalogueQuery.data ?? []).map((r) => [r.code, r.name])),
    [catalogueQuery.data],
  );

  const columns = React.useMemo<ColumnDef<ScheduleResponseDto>[]>(
    () => [
      { id: "report", header: t("columns.report"), cell: ({ row }) => reportNameByCode.get(row.original.reportCode) ?? row.original.reportCode },
      { id: "cron", header: t("columns.cron"), cell: ({ row }) => <span className="font-mono text-xs">{row.original.cron}</span> },
      { id: "recipients", header: t("columns.recipients"), cell: ({ row }) => t("recipientsCount", { count: scheduleRecipients(row.original).length }) },
      {
        id: "isActive",
        header: t("columns.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "success" : "soft-secondary"}>
            {row.original.isActive ? t("active") : t("inactive")}
          </Badge>
        ),
      },
      {
        id: "lastRun",
        header: t("columns.lastRun"),
        cell: ({ row }) => {
          const { lastRunAt } = row.original;
          if (!lastRunAt) return <span className="text-muted-foreground">{t("neverRun")}</span>;
          const ok = scheduleLastOk(row.original);
          return (
            <span className={ok === false ? "text-destructive" : "text-foreground"}>
              {new Date(lastRunAt).toLocaleString()} {ok === false && `(${t("lastRunFailed")})`}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <EditScheduleDialog schedule={row.original} />
            <DeleteScheduleButton schedule={row.original} />
          </div>
        ),
      },
    ],
    [t, tCommon, reportNameByCode],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <RunSchedulesDueButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={schedulesQuery} isEmpty={(d) => d.length === 0}>
            {(rows) => <DataTable columns={columns} data={rows} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
