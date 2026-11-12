"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MpesaConfig } from "../types";

/**
 * Controlled form for `MpesaConfig` — the exact real field names
 * `MpesaAdapterResolverService`'s `DarajaConfig` interface declares (see
 * `../types.ts`'s own doc comment). `consumerSecret`/`passkey`/
 * `securityCredential` are masked with a show/hide toggle (`<PasswordInput>`,
 * the same component every secret field in the Integrations forms now uses).
 *
 * Reused verbatim by BOTH `<NewIntegrationDialog>` (starting blank) and
 * `<EditIntegrationDialog>`'s "edit credentials" branch (starting from the
 * saved configuration, loaded on demand — see that dialog's doc comment).
 */
export function MpesaConfigForm({ value, onChange, disabled }: { value: MpesaConfig; onChange: (next: MpesaConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.mpesaForm");

  function set<K extends keyof MpesaConfig>(key: K, v: MpesaConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label required>{t("environment")}</Label>
          <Select value={value.environment} onValueChange={(v) => set("environment", v as MpesaConfig["environment"])} disabled={disabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">{t("environmentSandbox")}</SelectItem>
              <SelectItem value="production">{t("environmentProduction")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label required>{t("shortcode")}</Label>
          <Input value={value.shortcode} onChange={(e) => set("shortcode", e.target.value)} disabled={disabled} placeholder={t("shortcodePlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("consumerKey")}</Label>
          <Input value={value.consumerKey} onChange={(e) => set("consumerKey", e.target.value)} disabled={disabled} placeholder={t("consumerKeyPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("consumerSecret")}</Label>
          <PasswordInput
            showLockIcon={false}
            value={value.consumerSecret}
            onChange={(e) => set("consumerSecret", e.target.value)}
            disabled={disabled}
            placeholder={t("consumerSecretPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("passkey")}</Label>
          <PasswordInput showLockIcon={false} value={value.passkey} onChange={(e) => set("passkey", e.target.value)} disabled={disabled} placeholder={t("passkeyPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("callbackBaseUrl")}</Label>
          <Input
            value={value.callbackBaseUrl}
            onChange={(e) => set("callbackBaseUrl", e.target.value)}
            disabled={disabled}
            placeholder={t("callbackBaseUrlPlaceholder")}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">{t("b2cSectionTitle")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("initiatorName")}</Label>
            <Input value={value.initiatorName ?? ""} onChange={(e) => set("initiatorName", e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("securityCredential")}</Label>
            <PasswordInput showLockIcon={false} value={value.securityCredential ?? ""} onChange={(e) => set("securityCredential", e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("b2cShortcode")}</Label>
            <Input value={value.b2cShortcode ?? ""} onChange={(e) => set("b2cShortcode", e.target.value)} disabled={disabled} />
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
      </div>
    </div>
  );
}

export const EMPTY_MPESA_CONFIG: MpesaConfig = {
  environment: "sandbox",
  consumerKey: "",
  consumerSecret: "",
  shortcode: "",
  passkey: "",
  callbackBaseUrl: "",
  initiatorName: "",
  securityCredential: "",
  b2cShortcode: "",
  timeoutMs: undefined,
};

/** `MpesaConfig`'s own required fields (per `../types.ts` — the ones with no `?`) — used by both dialogs to gate their submit button before a wasted round trip. */
export function isMpesaConfigComplete(value: MpesaConfig): boolean {
  return Boolean(value.environment && value.consumerKey && value.consumerSecret && value.shortcode && value.passkey && value.callbackBaseUrl);
}
