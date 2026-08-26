"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReportDefinitionResponseDto, ReportResultResponseDto } from "@klickit/contracts";
import { DataTable } from "@/components/patterns/data-table";
import { formatReportCellValue, formatTotalValue, humanizeKey } from "../lib/report-formatting";

export interface ReportResultsTableProps {
  report: ReportDefinitionResponseDto;
  result: ReportResultResponseDto;
}

/**
 * Columns are built at runtime from `report.columns` (key/label/type) — no
 * fixed per-report DTO exists, `rows`/`totals` are both intentionally opaque
 * `Record<string, unknown>` at the API level. No server pagination — this
 * reporting engine returns full result sets in one response.
 */
export function ReportResultsTable({ report, result }: ReportResultsTableProps) {
  const t = useTranslations("reports.detail");

  const columns = React.useMemo<ColumnDef<Record<string, unknown>, unknown>[]>(
    () =>
      report.columns.map((col) => ({
        accessorKey: col.key,
        header: col.label,
        cell: ({ getValue }) => formatReportCellValue(getValue(), col.type),
      })),
    [report.columns],
  );

  const totalsEntries = result.totals ? Object.entries(result.totals) : [];

  return (
    <div className="space-y-4">
      <DataTable columns={columns} data={result.rows} />
      {totalsEntries.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("totalsTitle")}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {totalsEntries.map(([key, val]) => {
              const col = report.columns.find((c) => c.key === key);
              return (
                <div key={key}>
                  <p className="text-xs text-muted-foreground">{col?.label ?? humanizeKey(key)}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatTotalValue(val, col?.type, t("yesLabel"), t("noLabel"))}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
