"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BankAccountSelect } from "@/features/reports/components/param-fields/bank-account-select";
import type { KcbBuniConfig } from "../types";
import { BankIpnCashierPanel } from "./bank-ipn-cashier-panel";

/** The addresses KCB must be given — paths on this API (see `KcbIpnController`). */
const IPN_PATHS = [
  "/api/v1/callbacks/kcb/ipn/account-notification",
  "/api/v1/callbacks/kcb/ipn/till-notification",
  "/api/v1/callbacks/kcb/ipn/validation",
] as const;

/** A titled box, so the form's four jobs (connect / receive payments / collect on the phone / send money) read as separate things. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * Controlled form for `KcbBuniConfig`. `consumerSecret` / `ipnValidationSecret` are masked. The notification
 * addresses are shown ready to copy: in production this app and the API share one public origin (the reverse proxy
 * serves the API under `/api/v1`), so this page's own origin is what KCB should call.
 */
export function KcbBuniConfigForm({ value, onChange, disabled }: { value: KcbBuniConfig; onChange: (next: KcbBuniConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.kcbBuniForm");
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);

  function set<K extends keyof KcbBuniConfig>(key: K, v: KcbBuniConfig[K]) {
    onChange({ ...value, [key]: v });
  }
  const production = value.environment === "production";
  const validationAuth = value.ipnValidationAuth ?? "SIGNATURE";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label required>{t("environment")}</Label>
          <Select value={value.environment} onValueChange={(v) => set("environment", v as KcbBuniConfig["environment"])} disabled={disabled}>
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
          <Label required>{t("consumerKey")}</Label>
          <Input value={value.consumerKey} onChange={(e) => set("consumerKey", e.target.value)} disabled={disabled} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("consumerSecret")}</Label>
          <PasswordInput showLockIcon={false} value={value.consumerSecret} onChange={(e) => set("consumerSecret", e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label required={production}>{t("tokenUrl")}</Label>
          <Input
            value={value.tokenUrl ?? ""}
            onChange={(e) => set("tokenUrl", e.target.value)}
            disabled={disabled}
            placeholder={production ? "https://" : t("sandboxDefault")}
          />
        </div>
        <div className="space-y-1.5">
          <Label required={production}>{t("gatewayBaseUrl")}</Label>
          <Input
            value={value.gatewayBaseUrl ?? ""}
            onChange={(e) => set("gatewayBaseUrl", e.target.value)}
            disabled={disabled}
            placeholder={production ? "https://" : t("sandboxDefault")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("bankAccount")}</Label>
          <BankAccountSelect value={value.bankAccountId ?? ""} onChange={(id) => set("bankAccountId", id)} disabled={disabled} />
          <p className="text-xs text-muted-foreground">{t("bankAccountHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label>{t("creditAccountNumber")}</Label>
          <Input value={value.creditAccountNumber ?? ""} onChange={(e) => set("creditAccountNumber", e.target.value)} disabled={disabled} inputMode="numeric" />
          <p className="text-xs text-muted-foreground">{t("creditAccountNumberHint")}</p>
        </div>
      </div>

      <Section title={t("notificationsTitle")} hint={t("notificationsHint")}>
        <div className="space-y-1.5">
          <Label>{t("notificationAddresses")}</Label>
          {IPN_PATHS.map((path) => (
            <Input key={path} readOnly value={`${origin}${path}`} onFocus={(e) => e.currentTarget.select()} />
          ))}
        </div>
        <div className="space-y-1.5">
          <Label>{t("ipnPublicKey")}</Label>
          <Textarea
            value={value.ipnPublicKeyPem ?? ""}
            onChange={(e) => set("ipnPublicKeyPem", e.target.value)}
            disabled={disabled}
            rows={5}
            placeholder={"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">{t("ipnPublicKeyHint")}</p>
        </div>
        {!production && (
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={value.ipnSkipSignatureVerification === true}
              onChange={(e) => set("ipnSkipSignatureVerification", e.target.checked)}
              disabled={disabled}
              className="mt-0.5 size-4 rounded border-input"
            />
            <span>
              {t("skipSignature")}
              <span className="block text-xs text-muted-foreground">{t("skipSignatureHint")}</span>
            </span>
          </label>
        )}
        {value.ipnSkipSignatureVerification === true && !production && (
          <Alert variant="warning">
            <AlertDescription>{t("skipSignatureWarning")}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label>{t("validationAuth")}</Label>
          <Select value={validationAuth} onValueChange={(v) => set("ipnValidationAuth", v as KcbBuniConfig["ipnValidationAuth"])} disabled={disabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SIGNATURE">{t("validationAuthSignature")}</SelectItem>
              <SelectItem value="SHARED_SECRET">{t("validationAuthSecret")}</SelectItem>
              {!production && <SelectItem value="NONE">{t("validationAuthNone")}</SelectItem>}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("validationAuthHint")}</p>
        </div>
        {validationAuth === "SHARED_SECRET" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("validationHeader")}</Label>
              <Input value={value.ipnValidationHeader ?? ""} onChange={(e) => set("ipnValidationHeader", e.target.value)} disabled={disabled} placeholder="x-api-key" />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("validationSecret")}</Label>
              <PasswordInput showLockIcon={false} value={value.ipnValidationSecret ?? ""} onChange={(e) => set("ipnValidationSecret", e.target.value)} disabled={disabled} />
            </div>
          </div>
        )}
        {validationAuth === "NONE" && !production && (
          <Alert variant="warning">
            <AlertDescription>{t("validationNoneWarning")}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label>{t("cashierTitle")}</Label>
          <BankIpnCashierPanel />
        </div>
      </Section>

      <Section title={t("stkTitle")} hint={t("stkHint")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("stkAccountNumber")}</Label>
            <Input value={value.stkAccountNumber ?? ""} onChange={(e) => set("stkAccountNumber", e.target.value)} disabled={disabled} />
            <p className="text-xs text-muted-foreground">{t("stkAccountNumberHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("callbackBaseUrl")}</Label>
            <Input
              value={value.callbackBaseUrl ?? ""}
              onChange={(e) => set("callbackBaseUrl", e.target.value)}
              disabled={disabled}
              placeholder={origin ? `${origin}/api/v1` : "https://"}
            />
            <p className="text-xs text-muted-foreground">{t("callbackBaseUrlHint")}</p>
          </div>
        </div>
      </Section>

      <Section title={t("transferTitle")} hint={t("transferHint")}>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={value.fundsTransferEnabled === true}
            onChange={(e) => set("fundsTransferEnabled", e.target.checked)}
            disabled={disabled}
            className="mt-0.5 size-4 rounded border-input"
          />
          <span>
            {t("transferEnabled")}
            <span className="block text-xs text-muted-foreground">{t("transferEnabledHint")}</span>
          </span>
        </label>
        {value.fundsTransferEnabled === true && (
          <>
            {production && (
              <Alert variant="warning">
                <AlertDescription>{t("transferProductionWarning")}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label required>{t("companyCode")}</Label>
                <Input value={value.companyCode ?? ""} onChange={(e) => set("companyCode", e.target.value)} disabled={disabled} placeholder="KE0010001" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("transferType")}</Label>
                <Input value={value.fundsTransferType ?? ""} onChange={(e) => set("fundsTransferType", e.target.value)} disabled={disabled} placeholder="IF" maxLength={2} />
                <p className="text-xs text-muted-foreground">{t("transferTypeHint")}</p>
              </div>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

export const EMPTY_KCB_BUNI_CONFIG: KcbBuniConfig = {
  provider: "KCB_BUNI",
  environment: "sandbox",
  consumerKey: "",
  consumerSecret: "",
  tokenUrl: "",
  gatewayBaseUrl: "",
  bankAccountId: "",
  ipnPublicKeyPem: "",
  ipnSkipSignatureVerification: false,
  creditAccountNumber: "",
  ipnValidationAuth: "SIGNATURE",
  ipnValidationHeader: "",
  ipnValidationSecret: "",
  stkAccountNumber: "",
  callbackBaseUrl: "",
  companyCode: "",
  fundsTransferType: "",
  fundsTransferEnabled: false,
};

/** Key + secret always; production also needs both hosts; a shared-secret validation needs its secret; turning on Funds Transfer needs the company code. */
export function isKcbBuniConfigComplete(value: KcbBuniConfig): boolean {
  if (!value.consumerKey.trim() || !value.consumerSecret.trim()) return false;
  if (value.environment === "production" && !(value.tokenUrl?.trim() && value.gatewayBaseUrl?.trim())) return false;
  if (value.ipnValidationAuth === "SHARED_SECRET" && !value.ipnValidationSecret?.trim()) return false;
  if (value.fundsTransferEnabled === true && !value.companyCode?.trim()) return false;
  return true;
}

/** What gets saved: blank optional fields are left out, so the server's defaults apply. */
export function toKcbBuniPayload(value: KcbBuniConfig): Record<string, unknown> {
  const production = value.environment === "production";
  const payload: Record<string, unknown> = {
    provider: "KCB_BUNI",
    environment: value.environment,
    consumerKey: value.consumerKey.trim(),
    consumerSecret: value.consumerSecret.trim(),
  };
  for (const key of ["tokenUrl", "gatewayBaseUrl", "bankAccountId", "ipnPublicKeyPem", "creditAccountNumber", "stkAccountNumber", "callbackBaseUrl"] as const) {
    const text = value[key]?.trim();
    if (text) payload[key] = text;
  }
  if (value.ipnSkipSignatureVerification === true && !production) payload.ipnSkipSignatureVerification = true;

  const validationAuth = value.ipnValidationAuth ?? "SIGNATURE";
  if (validationAuth === "SHARED_SECRET") {
    payload.ipnValidationAuth = "SHARED_SECRET";
    payload.ipnValidationSecret = value.ipnValidationSecret?.trim();
    if (value.ipnValidationHeader?.trim()) payload.ipnValidationHeader = value.ipnValidationHeader.trim();
  } else if (validationAuth === "NONE" && !production) {
    payload.ipnValidationAuth = "NONE";
  }

  if (value.fundsTransferEnabled === true) {
    payload.fundsTransferEnabled = true;
    if (value.companyCode?.trim()) payload.companyCode = value.companyCode.trim();
    if (value.fundsTransferType?.trim()) payload.fundsTransferType = value.fundsTransferType.trim();
  }
  return payload;
}
