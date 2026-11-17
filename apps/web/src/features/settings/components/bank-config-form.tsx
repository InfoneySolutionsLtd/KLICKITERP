"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isKcbBuniBankConfig, type BankConfig, type BankFeedConfig, type KcbBuniConfig } from "../types";
import { BankFeedConfigForm, EMPTY_BANK_FEED_CONFIG, isBankFeedConfigComplete } from "./bank-feed-config-form";
import { EMPTY_KCB_BUNI_CONFIG, isKcbBuniConfigComplete, KcbBuniConfigForm, toKcbBuniPayload } from "./kcb-buni-config-form";

/**
 * A `BANK` integration is one of two things, told apart by the saved JSON's `provider`: the school's KCB BUNI
 * application (payment notifications, M-Pesa Express, transfers), or the older provider-agnostic HTTP statement
 * feed. This wrapper lets the dialogs treat "BANK" as ONE config with a provider switch.
 */
export function BankConfigForm({ value, onChange, disabled }: { value: BankConfig; onChange: (next: BankConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.bankProviderForm");
  const provider = isKcbBuniBankConfig(value) ? "kcb" : "feed";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label required>{t("provider")}</Label>
        <Select
          value={provider}
          onValueChange={(next) => onChange(next === "kcb" ? EMPTY_KCB_BUNI_CONFIG : EMPTY_BANK_FEED_CONFIG)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kcb">{t("providerKcb")}</SelectItem>
            <SelectItem value="feed">{t("providerFeed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isKcbBuniBankConfig(value) ? (
        <KcbBuniConfigForm value={value} onChange={onChange} disabled={disabled} />
      ) : (
        <BankFeedConfigForm value={value} onChange={onChange} disabled={disabled} />
      )}
    </div>
  );
}

/** A new BANK integration starts as KCB BUNI — the bank this school banks with. */
export const EMPTY_BANK_CONFIG: BankConfig = EMPTY_KCB_BUNI_CONFIG;

export function isBankConfigComplete(value: BankConfig): boolean {
  return isKcbBuniBankConfig(value) ? isKcbBuniConfigComplete(value) : isBankFeedConfigComplete(value);
}

/** The JSON that gets saved. */
export function bankConfigPayload(value: BankConfig): Record<string, unknown> {
  return isKcbBuniBankConfig(value) ? toKcbBuniPayload(value) : (value as unknown as Record<string, unknown>);
}

/** A saved BANK config laid over the matching provider's blank defaults, so a field the stored JSON omits still has a sane value. */
export function normalizeSavedBankConfig(saved: Record<string, unknown>): BankConfig {
  return saved.provider === "KCB_BUNI"
    ? ({ ...EMPTY_KCB_BUNI_CONFIG, ...(saved as Partial<KcbBuniConfig>) } as KcbBuniConfig)
    : ({ ...EMPTY_BANK_FEED_CONFIG, ...(saved as Partial<BankFeedConfig>) } as BankFeedConfig);
}
