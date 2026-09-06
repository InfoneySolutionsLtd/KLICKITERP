"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { NotificationResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMarkNotificationRead, useNotifications, useUnreadCount } from "@/features/notifications/hooks/use-notifications";
import { cn } from "@/lib/utils";

/**
 * Types with a real, translated title in `notifications.types.*` (all 3
 * locales) — anything else (a future, not-yet-localized `type` from a later
 * emitter) falls back to the raw server-composed `title` string as-is,
 * correct-by-default with zero frontend changes required. A plain `Set`
 * rather than `next-intl`'s translator, since this version has no public
 * "does this key exist" API to check against safely.
 */
const LOCALIZED_TYPES = new Set(["APPROVAL_PENDING", "APPROVAL_APPROVED", "APPROVAL_REJECTED", "APPROVAL_RETURNED"]);

/** `Intl.RelativeTimeFormat`-based, coarsest unit that isn't "0" — good enough for a dropdown list; the full `/notifications` page can show absolute timestamps instead if ever needed. */
function relativeTime(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return rtf.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return rtf.format(seconds, "second");
}

/**
 * Real, generic per-user notifications (`platform/notifications`,
 * `ApprovalEngineService`'s first real emitter) — replacing this
 * component's previous pure-UI-chrome placeholder (its own prior doc
 * comment: "there is still no real signal to drive [an unread count]").
 * `useUnreadCount()` polls every 60s (this app's first-ever polling — see
 * that hook's own doc comment for why) for the badge; the dropdown's own
 * list is a plain `useQuery`, refetched on window focus like everything
 * else in this app, not itself polled (only the cheap count endpoint is).
 * The `BellOff` + `queryBoundary.emptyTitle`/`emptyDescription` empty state
 * is KEPT from the original component, now shown only when the list is
 * genuinely empty (not just fully read).
 */
export function NotificationBell() {
  const t = useTranslations("shell.topbar");
  const tqb = useTranslations("queryBoundary");
  const tn = useTranslations("notifications");
  const router = useRouter();
  const unreadCountQuery = useUnreadCount();
  const notificationsQuery = useNotifications({ pageSize: 8 });
  const markRead = useMarkNotificationRead();

  const count = unreadCountQuery.data?.count ?? 0;
  const items = notificationsQuery.data?.items ?? [];

  function titleFor(notification: NotificationResponseDto): string {
    if (LOCALIZED_TYPES.has(notification.type)) {
      return tn(`types.${notification.type}.title` as Parameters<typeof tn>[0]);
    }
    return notification.title;
  }

  function handleItemClick(notification: NotificationResponseDto) {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.link) router.push(notification.link);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={count > 0 ? t("unreadAriaLabel", { count }) : t("notifications")}>
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">{t("notifications")}</DropdownMenuLabel>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-tint-primary">
              <BellOff className="size-5 text-primary" />
            </span>
            <p className="text-sm font-medium text-foreground">{tqb("emptyTitle")}</p>
            <p className="text-xs text-muted-foreground">{tqb("emptyDescription")}</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => handleItemClick(item)}
                className={cn("flex-col items-start gap-0.5 whitespace-normal py-2", !item.readAt && "bg-tint-primary")}
              >
                <div className="flex w-full items-center gap-2">
                  {!item.readAt && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="text-sm font-medium text-foreground">{titleFor(item)}</span>
                </div>
                {item.body && <p className="pl-3.5 text-xs text-muted-foreground">{item.body}</p>}
                <p className="pl-3.5 text-[11px] text-muted-foreground/70">{relativeTime(new Date(item.createdAt))}</p>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <Link href="/notifications" className="block rounded-sm px-2 py-1.5 text-center text-sm text-primary hover:underline">
          {t("viewAll")}
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
