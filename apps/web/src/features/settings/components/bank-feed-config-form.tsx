"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BankFeedConfig } from "../types";

/**
 * Controlled form for `BankFeedConfig` — the exact real field names
 * `GenericHttpBankFeedAdapter`'s `GenericHttpBankFeedConfig` interface
 * declares (see `../types.ts`'s own doc comment). `authHeaderValue` is
 * masked (`type="password"`).
 */
export function BankFeedConfigForm({ value, onChange, disabled }: { value: BankFeedConfig; onChange: (next: BankFeedConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.bankFeedForm");

  function set<K extends keyof BankFeedConfig>(key: K, v: BankFeedConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label required>{t("accountId")}</Label>
          <Input value={value.accountId} onChange={(e) => set("accountId", e.target.value)} disabled={disabled} placeholder={t("accountIdPlaceholder")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label required>{t("endpoint")}</Label>
          <Input value={value.endpoint} onChange={(e) => set("endpoint", e.target.value)} disabled={disabled} placeholder={t("endpointPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("dateField")}</Label>
          <Input value={value.dateField} onChange={(e) => set("dateField", e.target.value)} disabled={disabled} placeholder={t("dateFieldPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("descriptionField")}</Label>
          <Input value={value.descriptionField} onChange={(e) => set("descriptionField", e.target.value)} disabled={disabled} placeholder={t("descriptionFieldPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("amountField")}</Label>
          <Input value={value.amountField} onChange={(e) => set("amountField", e.target.value)} disabled={disabled} placeholder={t("amountFieldPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("refField")}</Label>
          <Input value={value.refField ?? ""} onChange={(e) => set("refField", e.target.value)} disabled={disabled} />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">{t("advancedSectionTitle")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("authHeaderName")}</Label>
            <Input value={value.authHeaderName ?? ""} onChange={(e) => set("authHeaderName", e.target.value)} disabled={disabled} placeholder={t("authHeaderNamePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("authHeaderValue")}</Label>
            <Input type="password" value={value.authHeaderValue ?? ""} onChange={(e) => set("authHeaderValue", e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("transactionsPath")}</Label>
            <Input value={value.transactionsPath ?? ""} onChange={(e) => set("transactionsPath", e.target.value)} disabled={disabled} placeholder={t("transactionsPathPlaceholder")} />
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

export const EMPTY_BANK_FEED_CONFIG: BankFeedConfig = {
  accountId: "",
  endpoint: "",
  method: "GET",
  authHeaderName: "",
  authHeaderValue: "",
  transactionsPath: "",
  dateField: "",
  descriptionField: "",
  amountField: "",
  refField: "",
  timeoutMs: undefined,
};

/** `BankFeedConfig`'s own required fields (per `../types.ts`) — gates the submit button before a wasted round trip. */
export function isBankFeedConfigComplete(value: BankFeedConfig): boolean {
  return Boolean(value.accountId && value.endpoint && value.dateField && value.descriptionField && value.amountField);
}
