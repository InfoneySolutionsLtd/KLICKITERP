"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SmsConfig } from "../types";

/**
 * Controlled form for `SmsConfig` — the exact real field names
 * `GenericHttpSmsAdapter`'s `GenericHttpSmsConfig` interface declares (see
 * `../types.ts`'s own doc comment). `authHeaderValue` is masked
 * (`type="password"`), same convention `<MpesaConfigForm>` establishes. Only
 * `endpoint` is required — every other field has a real server-side default.
 */
export function SmsConfigForm({ value, onChange, disabled }: { value: SmsConfig; onChange: (next: SmsConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.smsForm");

  function set<K extends keyof SmsConfig>(key: K, v: SmsConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label required>{t("endpoint")}</Label>
          <Input value={value.endpoint} onChange={(e) => set("endpoint", e.target.value)} disabled={disabled} placeholder={t("endpointPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("authHeaderName")}</Label>
          <Input value={value.authHeaderName ?? ""} onChange={(e) => set("authHeaderName", e.target.value)} disabled={disabled} placeholder={t("authHeaderNamePlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("authHeaderValue")}</Label>
          <Input type="password" value={value.authHeaderValue ?? ""} onChange={(e) => set("authHeaderValue", e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("timeoutMs")}</Label>
          <Input
            type="number"
            min={0}
            value={value.timeoutMs ?? ""}
            onChange={(e) => set("timeoutMs", e.target.value === "" ? undefined : Number(e.target.value))}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">{t("advancedSectionTitle")}</p>
        <div className="space-y-1.5">
          <Label>{t("bodyTemplate")}</Label>
          <Textarea value={value.bodyTemplate ?? ""} onChange={(e) => set("bodyTemplate", e.target.value)} disabled={disabled} placeholder={t("bodyTemplatePlaceholder")} rows={2} />
          <p className="text-xs text-muted-foreground">{t("bodyTemplateHint")}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("providerRefPath")}</Label>
            <Input value={value.providerRefPath ?? ""} onChange={(e) => set("providerRefPath", e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("costPath")}</Label>
            <Input value={value.costPath ?? ""} onChange={(e) => set("costPath", e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("segmentsPath")}</Label>
            <Input value={value.segmentsPath ?? ""} onChange={(e) => set("segmentsPath", e.target.value)} disabled={disabled} />
          </div>
        </div>
      </div>
    </div>
  );
}

export const EMPTY_SMS_CONFIG: SmsConfig = {
  endpoint: "",
  method: "POST",
  authHeaderName: "",
  authHeaderValue: "",
  bodyTemplate: "",
  providerRefPath: "",
  costPath: "",
  segmentsPath: "",
  timeoutMs: undefined,
};

/** `SmsConfig`'s own required field (per `../types.ts`) — gates the submit button before a wasted round trip. */
export function isSmsConfigComplete(value: SmsConfig): boolean {
  return Boolean(value.endpoint);
}
