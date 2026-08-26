"use client";

import { useTranslations } from "next-intl";
import type { TemplateResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * `CommChannel` (`SMS`/`EMAIL`/`PUSH`/`WHATSAPP`/`INAPP`) — same soft-tint
 * badge convention `ThemeStatusBadge` already establishes. Typed via
 * `TemplateResponseDto["channel"]` rather than a hand-typed union —
 * `CommChannel` itself is a `packages/server`-only TS type
 * (`comm-template.entity.ts`), never re-exported through `@klickit/contracts`
 * (confirmed: no schema file there mentions it), so the response DTO's own
 * field type is the closest real source of truth at this layer, mirroring
 * `ThemeStatusBadge`'s own `ThemeResponseDto["status"]` precedent.
 *
 * EMAIL/SMS/PUSH/WHATSAPP all have real delivery adapters now (WHATSAPP
 * joined the other three — see `AdapterResolverService.resolveWhatsapp()`,
 * `platform/comms/infrastructure/adapter-resolver.service.ts`) — whether any
 * of the four actually DELIVERS depends on a `set_integration_config` row of
 * the matching kind being enabled, the exact same ambiguity EMAIL/SMS/PUSH
 * already tolerate with no indicator here at all (this badge has no access
 * to live config-enabled state — it's rendered wherever a bare channel value
 * appears, e.g. a template list, decoupled from any specific config check).
 * WHATSAPP is treated identically to those three for the same reason.
 * INAPP is the one channel with NO adapter and none is planned — it's read
 * entirely from `comm_message` by a future WebSocket/notification-badge
 * consumer, never sent through this module's adapter machinery at all — so
 * it alone keeps the permanent "log-only" subtext, surfaced here rather than
 * a tooltip since this app has no `Tooltip` primitive yet (confirmed by
 * listing `components/ui/`).
 */
const CHANNEL_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  SMS: "soft-primary",
  EMAIL: "soft-primary",
  PUSH: "soft-primary",
  WHATSAPP: "soft-primary",
  INAPP: "soft-warning",
};

const LOG_ONLY_CHANNELS = new Set<TemplateResponseDto["channel"]>(["INAPP"]);

export function ChannelBadge({ channel }: { channel: TemplateResponseDto["channel"] }) {
  const t = useTranslations("communications.channels");
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={CHANNEL_VARIANT[channel] ?? "outline"} className="w-fit">
        {t(channel)}
      </Badge>
      {LOG_ONLY_CHANNELS.has(channel) && <span className="text-[11px] text-muted-foreground">{t("logOnlyNote")}</span>}
    </div>
  );
}
