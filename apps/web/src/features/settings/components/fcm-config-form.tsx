"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FcmConfig } from "../types";

/**
 * Controlled form for `FcmConfig` — the exact real field names
 * `FcmPushAdapter`'s `FcmPushConfig` interface declares (see `../types.ts`'s
 * own doc comment): the three individual fields pulled out of a Firebase
 * service-account JSON, not the raw JSON blob itself. `privateKey` is
 * masked (`type="password"`, rendered as a `<Textarea>` since a real PEM key
 * spans many lines) — a genuinely required field, same as the other two.
 */
export function FcmConfigForm({ value, onChange, disabled }: { value: FcmConfig; onChange: (next: FcmConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.fcmForm");

  function set<K extends keyof FcmConfig>(key: K, v: FcmConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label required>{t("projectId")}</Label>
          <Input value={value.projectId} onChange={(e) => set("projectId", e.target.value)} disabled={disabled} placeholder={t("projectIdPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("clientEmail")}</Label>
          <Input value={value.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} disabled={disabled} placeholder={t("clientEmailPlaceholder")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label required>{t("privateKey")}</Label>
        <Textarea
          value={value.privateKey}
          onChange={(e) => set("privateKey", e.target.value)}
          disabled={disabled}
          placeholder={t("privateKeyPlaceholder")}
          rows={4}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">{t("privateKeyHint")}</p>
      </div>
    </div>
  );
}

export const EMPTY_FCM_CONFIG: FcmConfig = {
  projectId: "",
  clientEmail: "",
  privateKey: "",
};

/** `FcmConfig`'s own required fields (per `../types.ts`) — gates the submit button before a wasted round trip. */
export function isFcmConfigComplete(value: FcmConfig): boolean {
  return Boolean(value.projectId && value.clientEmail && value.privateKey);
}
