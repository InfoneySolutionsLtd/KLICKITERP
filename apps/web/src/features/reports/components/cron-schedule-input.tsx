"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A safe, always-due-soon default — monthly, the 1st of the month. */
export const DEFAULT_CRON = "0 0 1 * *";

const FIELD_COUNT = 5;
/** Only these 3 (day-of-month, month, day-of-week) are ever actually consulted by `isDueOn()` — see this component's own doc comment below. */
const CONSULTED_FIELD_INDEXES = [2, 3, 4];

const PRESETS = [
  { value: "0 0 1 * *", labelKey: "presetMonthly" },
  { value: "0 0 * * 1", labelKey: "presetWeekly" },
] as const;

function splitCronFields(cron: string): string[] {
  const parts = cron.trim().length > 0 ? cron.trim().split(/\s+/) : [];
  const fields: string[] = [];
  for (let i = 0; i < FIELD_COUNT; i++) {
    fields.push(parts[i] ?? "*");
  }
  return fields;
}

/** `"*"` or a single exact non-negative integer, nothing else — mirrors `ReportSchedulesService.validateCronShape()` (`packages/server/src/domains/reporting/application/report-schedules.service.ts`) EXACTLY, so a client-side-blocked submit never disagrees with the real 422 the server would otherwise throw. */
function isValidCronField(field: string): boolean {
  return field === "*" || /^\d+$/.test(field);
}

export function isValidCronShape(cron: string): boolean {
  const fields = splitCronFields(cron);
  return fields.length === FIELD_COUNT && fields.every(isValidCronField);
}

/**
 * **Duplicated, not cross-imported, from `features/expenses/components/cron-schedule-input.tsx`**
 * — matching this codebase's own established "duplicate rather than
 * cross-domain-import" convention (`ReportSchedulesService`'s own doc
 * comment explicitly reimplements `validateCronShape()` rather than
 * importing `RecurringService`'s, citing `module-deps.json`). Identical
 * 5-field shape and validation grammar; only the day-of-month/month/
 * day-of-week fields are ever consulted by `isDueOn()` — minute/hour carry a
 * visibly muted "(unused)" label suffix rather than silently implying they
 * control anything.
 */
export function CronScheduleInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.schedules.cronInput");
  const fields = splitCronFields(value);
  const fieldLabels = [t("minuteLabel"), t("hourLabel"), t("dayOfMonthLabel"), t("monthLabel"), t("dayOfWeekLabel")];

  function handleFieldChange(index: number, raw: string) {
    const trimmed = raw.trim();
    const next = [...fields];
    next[index] = trimmed;
    onChange(next.join(" "));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-2">
        {fields.map((field, index) => {
          const valid = isValidCronField(field);
          const consulted = CONSULTED_FIELD_INDEXES.includes(index);
          return (
            <div key={index} className="space-y-1">
              <Label className="text-xs font-normal">
                {fieldLabels[index]}
                {!consulted && <span className="text-muted-foreground"> {t("unusedSuffix")}</span>}
              </Label>
              <Input
                value={field}
                onChange={(e) => handleFieldChange(index, e.target.value)}
                disabled={disabled}
                className={cn("text-center", !valid && "border-destructive focus-visible:ring-destructive")}
                aria-invalid={!valid}
              />
            </div>
          );
        })}
      </div>
      {!isValidCronShape(value) && <p className="text-xs text-destructive">{t("invalidFieldError")}</p>}
      <p className="text-xs text-muted-foreground">{t("helpText")}</p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.value} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange(preset.value)}>
            {t(preset.labelKey)}
          </Button>
        ))}
      </div>
    </div>
  );
}
