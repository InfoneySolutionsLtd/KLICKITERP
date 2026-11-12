"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import type { SmtpConfig } from "../types";

/**
 * Controlled form for `SmtpConfig` — the exact real field names
 * `SmtpMailAdapter`'s `SmtpMailConfig` interface declares (see `../types.ts`'s
 * own doc comment). `pass` is masked with a show/hide toggle
 * (`<PasswordInput>`), same as every other secret field in the Integrations
 * forms. Reused verbatim by both `<NewIntegrationDialog>` (starting from
 * `EMPTY_SMTP_CONFIG`) and `<EditIntegrationDialog>`'s "resubmit credentials"
 * branch (starting from the saved configuration, fetched on demand).
 */
export function SmtpConfigForm({ value, onChange, disabled }: { value: SmtpConfig; onChange: (next: SmtpConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.smtpForm");

  function set<K extends keyof SmtpConfig>(key: K, v: SmtpConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label required>{t("host")}</Label>
        <Input value={value.host} onChange={(e) => set("host", e.target.value)} disabled={disabled} placeholder={t("hostPlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label required>{t("port")}</Label>
        <Input
          type="number"
          min={0}
          value={value.port}
          onChange={(e) => set("port", Number(e.target.value) || 0)}
          disabled={disabled}
          placeholder={t("portPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("user")}</Label>
        <Input value={value.user ?? ""} onChange={(e) => set("user", e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("pass")}</Label>
        <PasswordInput showLockIcon={false} value={value.pass ?? ""} onChange={(e) => set("pass", e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label required>{t("fromAddress")}</Label>
        <Input
          value={value.fromAddress}
          onChange={(e) => set("fromAddress", e.target.value)}
          disabled={disabled}
          placeholder={t("fromAddressPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("fromName")}</Label>
        <Input value={value.fromName ?? ""} onChange={(e) => set("fromName", e.target.value)} disabled={disabled} />
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={value.secure ?? false}
          onChange={(e) => set("secure", e.target.checked)}
          disabled={disabled}
          className="size-4 rounded border-input"
        />
        {t("secureLabel")}
      </label>
    </div>
  );
}

/**
 * New-integration defaults: port 465 with "Use TLS/SSL" ticked (implicit TLS —
 * the combination `nodemailer` expects for 465). The alternative submission
 * setup is 587 with TLS/SSL UNticked (STARTTLS); ports 993/995 are IMAP/POP3
 * mailbox ports and will fail an SMTP connection test.
 */
export const EMPTY_SMTP_CONFIG: SmtpConfig = {
  host: "",
  port: 465,
  secure: true,
  user: "",
  pass: "",
  fromAddress: "",
  fromName: "",
};

/** `SmtpConfig`'s own required fields (per `../types.ts`) — used by both dialogs to gate their submit button before a wasted round trip. */
export function isSmtpConfigComplete(value: SmtpConfig): boolean {
  return Boolean(value.host && value.port && value.fromAddress);
}
