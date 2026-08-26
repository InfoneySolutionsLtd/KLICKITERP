"use client";

import { useTranslations } from "next-intl";
import type { ReportDefinitionResponseDto } from "@klickit/contracts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UUID_PARAM_PICKERS } from "../lib/report-param-fields";

export interface ReportParamsFormProps {
  report: ReportDefinitionResponseDto;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled?: boolean;
}

/**
 * Not a generic schema-driven form builder — a straightforward per-param
 * renderer. `paramsShape` (`GET /reports/:code`) only carries 4 primitive
 * types; `"uuid"` params are routed through `UUID_PARAM_PICKERS` (real
 * entity-pickers keyed by param name) when one exists, else fall back to a
 * plain text input (only ever hit for Audit Log's polymorphic `entityId`).
 * Every param is treated as required — the API doesn't declare optionality.
 */
export function ReportParamsForm({ report, value, onChange, disabled }: ReportParamsFormProps) {
  const t = useTranslations("reports.params");

  function setField(key: string, fieldValue: string) {
    onChange({ ...value, [key]: fieldValue });
  }

  const entries = Object.entries(report.paramsShape);
  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {entries.map(([key, type]) => {
        const fieldValue = value[key] ?? "";
        const onFieldChange = (next: string) => setField(key, next);

        return (
          <div key={key} className="space-y-1.5">
            <Label required>{t(key)}</Label>
            {type === "uuid" ? (
              (() => {
                const Picker = UUID_PARAM_PICKERS[key];
                return Picker ? (
                  <Picker value={fieldValue} onChange={onFieldChange} disabled={disabled} />
                ) : (
                  <Input value={fieldValue} onChange={(e) => onFieldChange(e.target.value)} disabled={disabled} />
                );
              })()
            ) : type === "date" ? (
              <Input type="date" value={fieldValue} onChange={(e) => onFieldChange(e.target.value)} disabled={disabled} />
            ) : type === "number" ? (
              <Input type="number" value={fieldValue} onChange={(e) => onFieldChange(e.target.value)} disabled={disabled} />
            ) : (
              <Input type="text" value={fieldValue} onChange={(e) => onFieldChange(e.target.value)} disabled={disabled} />
            )}
          </div>
        );
      })}
    </div>
  );
}
