"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAcademicYears } from "@/features/billing/hooks/use-academic-calendar";

/** Backs `academicYearId` params (e.g. Term-wise Balance Report). Flat — unlike `termId`, an academic year has no parent to cascade from. */
export function AcademicYearSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.academicYear");
  const query = useAcademicYears();

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || query.isLoading}>
      <SelectTrigger>
        <SelectValue placeholder={query.isLoading ? t("loading") : t("placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {(query.data ?? []).map((year) => (
          <SelectItem key={year.id} value={year.id}>
            {year.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
