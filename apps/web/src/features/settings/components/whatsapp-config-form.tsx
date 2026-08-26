"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WhatsappConfig } from "../types";

/**
 * Controlled form for `WhatsappConfig` — structurally identical to
 * `SmsConfig` (see that type's own doc comment: WhatsApp resolves through
 * the SAME `GenericHttpSmsAdapter` class, `AdapterResolverService.resolveWhatsapp()`),
 * kept as its own file/component per this codebase's own established
 * per-kind convention (`<XeroConfigForm>`/`<SageConfigForm>` are likewise
 * full independent copies of `<QuickBooksConfigForm>`'s shape, not a shared
 * parameterized component) — own i18n namespace, own doc comment, own
 * discoverability. `authHeaderValue` is masked (`type="password"`).
 */
export function WhatsappConfigForm({
  value,
  onChange,
  disabled,
}: {
  value: WhatsappConfig;
  onChange: (next: WhatsappConfig) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("settings.integrations.whatsappForm");

  function set<K extends keyof WhatsappConfig>(key: K, v: WhatsappConfig[K]) {
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

export const EMPTY_WHATSAPP_CONFIG: WhatsappConfig = {
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

/** `WhatsappConfig`'s own required field (per `../types.ts`) — gates the submit button before a wasted round trip. */
export function isWhatsappConfigComplete(value: WhatsappConfig): boolean {
  return Boolean(value.endpoint);
}
