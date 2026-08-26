"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFiscalYears } from "@/features/accounting/hooks/use-fiscal-years";
import { usePeriodsForFiscalYear } from "@/features/accounting/hooks/use-periods";

/**
 * No flat "list all periods" endpoint exists anywhere in this codebase —
 * every consumer reaches a period via its own parent fiscal year (confirmed
 * by reading `fiscal-years.controller.ts` directly). Copies the exact
 * two-step Fiscal Year -> Period shape already established in
 * `features/banking/components/start-reconciliation-dialog.tsx` and
 * `features/fixed-assets/components/create-depreciation-run-dialog.tsx`,
 * rather than a single flat `<Combobox>`.
 */
export function PeriodSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.period");
  const [fiscalYearId, setFiscalYearId] = React.useState("");

  const fiscalYearsQuery = useFiscalYears();
  const periodsQuery = usePeriodsForFiscalYear(fiscalYearId || undefined);

  function handleFiscalYearChange(next: string) {
    setFiscalYearId(next);
    onChange(""); // the previously-picked period belonged to the old year's own list
  }

  return (
    <div className="space-y-2">
      <Select value={fiscalYearId} onValueChange={handleFiscalYearChange} disabled={disabled || fiscalYearsQuery.isLoading}>
        <SelectTrigger>
          <SelectValue placeholder={t("selectFiscalYearPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {(fiscalYearsQuery.data ?? []).map((fy) => (
            <SelectItem key={fy.id} value={fy.id}>
              {fy.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value} onValueChange={onChange} disabled={disabled || !fiscalYearId || periodsQuery.isLoading}>
        <SelectTrigger>
          <SelectValue placeholder={fiscalYearId ? t("selectPeriodPlaceholder") : t("chooseFiscalYearFirst")} />
        </SelectTrigger>
        <SelectContent>
          {(periodsQuery.data ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {t("periodOptionLabel", { seq: p.seq, startsOn: p.startsOn, endsOn: p.endsOn })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
