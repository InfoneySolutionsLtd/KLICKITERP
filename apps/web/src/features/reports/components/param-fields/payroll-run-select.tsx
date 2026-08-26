"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useRuns } from "@/features/payroll/hooks/use-payroll-runs";

/** Backs Payroll Summary's and Statutory Summary's `runId` param. Cross-feature import of `useRuns()`. */
export function PayrollRunSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.payrollRun");
  const tKinds = useTranslations("payroll.runs.kinds");
  const tStatuses = useTranslations("payroll.runs.statuses");
  const query = useRuns();

  const items = React.useMemo(
    () =>
      (query.data ?? []).map((run) => ({
        value: run.id,
        label: `${run.periodKey} — ${tKinds(run.runKind)} — ${tStatuses(run.status)}`,
      })),
    [query.data, tKinds, tStatuses],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={query.isLoading ? t("loading") : t("placeholder")}
      searchPlaceholder={t("searchPlaceholder")}
      emptyText={t("empty")}
      disabled={disabled || query.isLoading}
    />
  );
}
