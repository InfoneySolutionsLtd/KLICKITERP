"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { CONFIGURABLE_INTEGRATION_KINDS } from "../constants";
import { useLoadIntegrationCredentials, useUpdateIntegrationConfig } from "../hooks/use-integration-configs";
import type { BankFeedConfig, FcmConfig, IntegrationConfig, MpesaConfig, QuickBooksConfig, SageConfig, SmsConfig, SmtpConfig, WhatsappConfig, XeroConfig } from "../types";
import { EMPTY_MPESA_CONFIG, MpesaConfigForm, isMpesaConfigComplete } from "./mpesa-config-form";
import { EMPTY_QUICKBOOKS_CONFIG, QuickBooksConfigForm, isQuickBooksConfigComplete } from "./quickbooks-config-form";
import { EMPTY_XERO_CONFIG, XeroConfigForm, isXeroConfigComplete } from "./xero-config-form";
import { EMPTY_SAGE_CONFIG, SageConfigForm, isSageConfigComplete } from "./sage-config-form";
import { EMPTY_SMTP_CONFIG, SmtpConfigForm, isSmtpConfigComplete } from "./smtp-config-form";
import { EMPTY_SMS_CONFIG, SmsConfigForm, isSmsConfigComplete } from "./sms-config-form";
import { EMPTY_FCM_CONFIG, FcmConfigForm, isFcmConfigComplete } from "./fcm-config-form";
import { EMPTY_WHATSAPP_CONFIG, WhatsappConfigForm, isWhatsappConfigComplete } from "./whatsapp-config-form";
import { EMPTY_BANK_FEED_CONFIG, BankFeedConfigForm, isBankFeedConfigComplete } from "./bank-feed-config-form";

/**
 * Edit flow. Name/enabled/priority are ordinary, pre-filled, freely-editable
 * fields (`UpdateIntegrationConfigDto` makes `config` genuinely optional —
 * these three can change without touching credentials at all). Credentials
 * are behind an explicit, OFF-by-default "Edit credentials" checkbox; ticking
 * it fetches the SAVED configuration (`GET .../{id}/credentials`, gated by its
 * own `settings:integration:reveal` permission, uncached, logged) and pre-fills the
 * form with it, so an editor changes only what needs changing instead of
 * re-keying everything. The full resulting configuration is sent back on save
 * (still a whole-payload replace, never a partial patch).
 *
 * Handling of the decrypted values: they live only in this dialog's state,
 * are fetched lazily (never just because the dialog opened), are cleared when
 * the dialog closes, and are never put in the shared query cache (the load is
 * a mutation — see `useLoadIntegrationCredentials`). If they can't be loaded
 * (no `reveal` permission, or the encryption key changed since they were
 * saved) the form falls back to blank so they can simply be entered again.
 *
 * Phase 6 Slice 11 Part 4 — `config.kind` is immutable post-creation (not
 * even present in `UpdateIntegrationConfigDto`), so this dialog genuinely
 * branches on the EXISTING config's kind to pick the matching form/state/
 * validator (`MPESA`/`QUICKBOOKS`/`XERO`/`SAGE`) instead of the previous
 * `config.kind === "MPESA"` single-kind check — real branching logic, not
 * just an additive registration.
 */
export function EditIntegrationDialog({ config }: { config: IntegrationConfig }) {
  const t = useTranslations("settings.integrations");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(config.name);
  const [isEnabled, setIsEnabled] = React.useState(config.isEnabled);
  const [priority, setPriority] = React.useState(config.priority);
  const [resubmitCredentials, setResubmitCredentials] = React.useState(false);
  const [mpesaConfig, setMpesaConfig] = React.useState<MpesaConfig>(EMPTY_MPESA_CONFIG);
  const [quickbooksConfig, setQuickbooksConfig] = React.useState<QuickBooksConfig>(EMPTY_QUICKBOOKS_CONFIG);
  const [xeroConfig, setXeroConfig] = React.useState<XeroConfig>(EMPTY_XERO_CONFIG);
  const [sageConfig, setSageConfig] = React.useState<SageConfig>(EMPTY_SAGE_CONFIG);
  const [smtpConfig, setSmtpConfig] = React.useState<SmtpConfig>(EMPTY_SMTP_CONFIG);
  const [smsConfig, setSmsConfig] = React.useState<SmsConfig>(EMPTY_SMS_CONFIG);
  const [fcmConfig, setFcmConfig] = React.useState<FcmConfig>(EMPTY_FCM_CONFIG);
  const [whatsappConfig, setWhatsappConfig] = React.useState<WhatsappConfig>(EMPTY_WHATSAPP_CONFIG);
  const [bankFeedConfig, setBankFeedConfig] = React.useState<BankFeedConfig>(EMPTY_BANK_FEED_CONFIG);
  const [error, setError] = React.useState<string | null>(null);
  const [credentialsState, setCredentialsState] = React.useState<"idle" | "loading" | "ready" | "failed">("idle");
  // Bumped on every toggle/close so a slow credentials response that arrives
  // after the user has unticked the box or closed the dialog is discarded
  // instead of re-populating (and re-exposing) the form.
  const loadRequestId = React.useRef(0);
  const updateMutation = useUpdateIntegrationConfig();
  const loadCredentialsMutation = useLoadIntegrationCredentials();

  const isConfigurable = CONFIGURABLE_INTEGRATION_KINDS.includes(config.kind);

  /** Back to blank defaults for every kind — also how decrypted secrets are dropped from memory. */
  function clearCredentialForms() {
    setMpesaConfig(EMPTY_MPESA_CONFIG);
    setQuickbooksConfig(EMPTY_QUICKBOOKS_CONFIG);
    setXeroConfig(EMPTY_XERO_CONFIG);
    setSageConfig(EMPTY_SAGE_CONFIG);
    setSmtpConfig(EMPTY_SMTP_CONFIG);
    setSmsConfig(EMPTY_SMS_CONFIG);
    setFcmConfig(EMPTY_FCM_CONFIG);
    setWhatsappConfig(EMPTY_WHATSAPP_CONFIG);
    setBankFeedConfig(EMPTY_BANK_FEED_CONFIG);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    loadRequestId.current += 1;
    // Reset on BOTH open and close: opening starts from the row's own values,
    // closing discards any decrypted credentials the dialog was holding.
    setResubmitCredentials(false);
    setCredentialsState("idle");
    clearCredentialForms();
    setError(null);
    if (next) {
      setName(config.name);
      setIsEnabled(config.isEnabled);
      setPriority(config.priority);
    }
  }

  /** Overlays the saved configuration onto each kind's defaults, so a field the stored payload omits still has a sane value. */
  function applySavedConfig(saved: Record<string, unknown>) {
    switch (config.kind) {
      case "MPESA":
        setMpesaConfig({ ...EMPTY_MPESA_CONFIG, ...(saved as Partial<MpesaConfig>) });
        break;
      case "QUICKBOOKS":
        setQuickbooksConfig({ ...EMPTY_QUICKBOOKS_CONFIG, ...(saved as Partial<QuickBooksConfig>) });
        break;
      case "XERO":
        setXeroConfig({ ...EMPTY_XERO_CONFIG, ...(saved as Partial<XeroConfig>) });
        break;
      case "SAGE":
        setSageConfig({ ...EMPTY_SAGE_CONFIG, ...(saved as Partial<SageConfig>) });
        break;
      case "SMTP":
        // `secure` is pinned to what was actually saved: the mail adapter
        // treats a missing `secure` as FALSE, whereas the blank form now
        // defaults to TRUE (port 465) — letting that default leak into an
        // older saved config would silently flip its TLS mode on the next save.
        setSmtpConfig({ ...EMPTY_SMTP_CONFIG, ...(saved as Partial<SmtpConfig>), secure: saved.secure === true });
        break;
      case "SMS":
        setSmsConfig({ ...EMPTY_SMS_CONFIG, ...(saved as Partial<SmsConfig>) });
        break;
      case "FCM":
        setFcmConfig({ ...EMPTY_FCM_CONFIG, ...(saved as Partial<FcmConfig>) });
        break;
      case "WHATSAPP":
        setWhatsappConfig({ ...EMPTY_WHATSAPP_CONFIG, ...(saved as Partial<WhatsappConfig>) });
        break;
      case "BANK":
        setBankFeedConfig({ ...EMPTY_BANK_FEED_CONFIG, ...(saved as Partial<BankFeedConfig>) });
        break;
      default:
        break;
    }
  }

  async function handleResubmitToggle(checked: boolean) {
    setResubmitCredentials(checked);
    setError(null);
    const requestId = ++loadRequestId.current;
    if (!checked) {
      clearCredentialForms();
      setCredentialsState("idle");
      return;
    }
    setCredentialsState("loading");
    try {
      const saved = await loadCredentialsMutation.mutateAsync(config.id);
      if (requestId !== loadRequestId.current) return;
      applySavedConfig(saved.config);
      setCredentialsState("ready");
    } catch (err) {
      if (requestId !== loadRequestId.current) return;
      // Fall back to the blank form so the credentials can simply be entered again.
      clearCredentialForms();
      setCredentialsState("failed");
      // 403 = this user may edit integrations but doesn't hold the separate
      // "reveal credentials" permission; say so plainly rather than echoing a
      // raw permission-code message. Any other failure keeps the server's text
      // (e.g. the 422 "could not be decrypted").
      if (err instanceof ApiError) {
        setError(err.status === 403 ? t("credentialsRevealForbidden") : err.message);
      } else {
        setError(t("credentialsLoadFailed"));
      }
    }
  }

  function isCurrentConfigComplete(): boolean {
    switch (config.kind) {
      case "MPESA":
        return isMpesaConfigComplete(mpesaConfig);
      case "QUICKBOOKS":
        return isQuickBooksConfigComplete(quickbooksConfig);
      case "XERO":
        return isXeroConfigComplete(xeroConfig);
      case "SAGE":
        return isSageConfigComplete(sageConfig);
      case "SMTP":
        return isSmtpConfigComplete(smtpConfig);
      case "SMS":
        return isSmsConfigComplete(smsConfig);
      case "FCM":
        return isFcmConfigComplete(fcmConfig);
      case "WHATSAPP":
        return isWhatsappConfigComplete(whatsappConfig);
      case "BANK":
        return isBankFeedConfigComplete(bankFeedConfig);
      default:
        return false;
    }
  }

  function currentConfigPayload(): Record<string, unknown> {
    switch (config.kind) {
      case "MPESA":
        return mpesaConfig as unknown as Record<string, unknown>;
      case "QUICKBOOKS":
        return quickbooksConfig as unknown as Record<string, unknown>;
      case "XERO":
        return xeroConfig as unknown as Record<string, unknown>;
      case "SAGE":
        return sageConfig as unknown as Record<string, unknown>;
      case "SMTP":
        return smtpConfig as unknown as Record<string, unknown>;
      case "SMS":
        return smsConfig as unknown as Record<string, unknown>;
      case "FCM":
        return fcmConfig as unknown as Record<string, unknown>;
      case "WHATSAPP":
        return whatsappConfig as unknown as Record<string, unknown>;
      case "BANK":
        return bankFeedConfig as unknown as Record<string, unknown>;
      default:
        return {};
    }
  }

  // Hidden while the saved configuration is still loading, so a half-loaded
  // (blank) form can never be saved over the real credentials.
  const showCredentialForm = resubmitCredentials && credentialsState !== "loading";
  const canSubmit = name.trim().length > 0 && credentialsState !== "loading" && (!resubmitCredentials || isCurrentConfigComplete());

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: config.id,
        input: {
          name: name.trim(),
          isEnabled,
          priority,
          ...(resubmitCredentials ? { config: currentConfigPayload() } : {}),
        },
      });
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {t("editTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editTitle", { name: config.name })}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("priority")}</Label>
              <Input type="number" min={0} value={priority} onChange={(e) => setPriority(Number(e.target.value) || 0)} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="size-4 rounded border-input" />
              {t("isEnabledLabel")}
            </label>
          </div>

          {isConfigurable && (
            <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={resubmitCredentials}
                  onChange={(e) => void handleResubmitToggle(e.target.checked)}
                  disabled={updateMutation.isPending}
                  className="size-4 rounded border-input"
                />
                {t("resubmitCredentialsLabel")}
              </label>
              <p className="text-xs text-muted-foreground">{t("resubmitCredentialsHint")}</p>
              {credentialsState === "loading" && (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("loadingCredentials")}
                </p>
              )}
              {showCredentialForm && config.kind ==="MPESA" && (
                <MpesaConfigForm value={mpesaConfig} onChange={setMpesaConfig} disabled={updateMutation.isPending} />
              )}
              {showCredentialForm && config.kind ==="QUICKBOOKS" && (
                <QuickBooksConfigForm value={quickbooksConfig} onChange={setQuickbooksConfig} disabled={updateMutation.isPending} />
              )}
              {showCredentialForm && config.kind ==="XERO" && (
                <XeroConfigForm value={xeroConfig} onChange={setXeroConfig} disabled={updateMutation.isPending} />
              )}
              {showCredentialForm && config.kind ==="SAGE" && (
                <SageConfigForm value={sageConfig} onChange={setSageConfig} disabled={updateMutation.isPending} />
              )}
              {showCredentialForm && config.kind ==="SMTP" && (
                <SmtpConfigForm value={smtpConfig} onChange={setSmtpConfig} disabled={updateMutation.isPending} />
              )}
              {showCredentialForm && config.kind ==="SMS" && (
                <SmsConfigForm value={smsConfig} onChange={setSmsConfig} disabled={updateMutation.isPending} />
              )}
              {showCredentialForm && config.kind ==="FCM" && (
                <FcmConfigForm value={fcmConfig} onChange={setFcmConfig} disabled={updateMutation.isPending} />
              )}
              {showCredentialForm && config.kind ==="WHATSAPP" && (
                <WhatsappConfigForm value={whatsappConfig} onChange={setWhatsappConfig} disabled={updateMutation.isPending} />
              )}
              {showCredentialForm && config.kind ==="BANK" && (
                <BankFeedConfigForm value={bankFeedConfig} onChange={setBankFeedConfig} disabled={updateMutation.isPending} />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : t("saveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
