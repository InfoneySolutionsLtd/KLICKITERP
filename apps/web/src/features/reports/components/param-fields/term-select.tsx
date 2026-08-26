"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAcademicYears, useTerms } from "@/features/billing/hooks/use-academic-calendar";

/**
 * Backs `termId` params (e.g. Invoice Balance by Grade). `bill_invoice.term_id`
 * has no flat "list all terms across every year" picker precedent — every
 * existing consumer reaches a term via its own parent academic year, same
 * shape as `period-select.tsx`'s Fiscal-Year → Period cascade, just built on
 * `useAcademicYears()`/`useTerms(academicYearId)` (`features/billing/hooks/use-academic-calendar.ts`,
 * cross-imported — already the real, working hooks this billing feature's
 * own screens use) instead of the GL fiscal-year/period pair.
 */
export function TermSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.term");
  const [academicYearId, setAcademicYearId] = React.useState("");

  const academicYearsQuery = useAcademicYears();
  const termsQuery = useTerms(academicYearId || undefined);

  function handleAcademicYearChange(next: string) {
    setAcademicYearId(next);
    onChange(""); // the previously-picked term belonged to the old year's own list
  }

  return (
    <div className="space-y-2">
      <Select value={academicYearId} onValueChange={handleAcademicYearChange} disabled={disabled || academicYearsQuery.isLoading}>
        <SelectTrigger>
          <SelectValue placeholder={t("selectAcademicYearPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {(academicYearsQuery.data ?? []).map((year) => (
            <SelectItem key={year.id} value={year.id}>
              {year.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value} onValueChange={onChange} disabled={disabled || !academicYearId || termsQuery.isLoading}>
        <SelectTrigger>
          <SelectValue placeholder={academicYearId ? t("selectTermPlaceholder") : t("chooseAcademicYearFirst")} />
        </SelectTrigger>
        <SelectContent>
          {(termsQuery.data ?? []).map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
