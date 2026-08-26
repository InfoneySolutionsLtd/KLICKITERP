"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useDepreciationRuns } from "@/features/fixed-assets/hooks/use-depreciation-runs";

/**
 * Backs Depreciation Schedule's `depreciationRunId` param — named
 * `depreciationRunId`, not `runId`, deliberately: `runId` is already claimed
 * by `PayrollRunSelect` in `UUID_PARAM_PICKERS`, a different entity kind.
 * `FaDepreciationRunResponseDto` carries only `id/periodId/status/
 * approvalRef/journalId` — no denormalized period label — so the label
 * falls back to a truncated `periodId` plus status, the same "show a
 * truncated id when no richer label exists on the DTO" shape this codebase
 * accepts elsewhere for a thin response DTO.
 */
export function DepreciationRunSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.depreciationRun");
  const query = useDepreciationRuns();

  const items = React.useMemo(
    () =>
      (query.data ?? []).map((run) => ({
        value: run.id,
        label: `${run.periodId.slice(0, 8)} — ${run.status}`,
      })),
    [query.data],
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
