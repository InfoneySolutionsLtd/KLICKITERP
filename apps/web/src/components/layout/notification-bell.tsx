"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { NotificationResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NotificationContent, ReadToggle } from "@/features/notifications/components/notification-parts";
import { useNotificationStream } from "@/features/notifications/hooks/use-notification-stream";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useNotifications,
  useUnreadCount,
} from "@/features/notifications/hooks/use-notifications";
import { relativeTime } from "@/features/notifications/relative-time";
import { cn } from "@/lib/utils";

/**
 * Real, generic per-user notifications (`platform/notifications`): the badge, the latest eight, and a way to act on them
 * without leaving the page — open one (which also marks it read), mark one read or unread, or mark everything read.
 *
 * New notifications arrive within a second or two through the live stream (`useNotificationStream`, which only tells the
 * queries below to ask again). `useUnreadCount()` still polls every 60 s as the fallback for when the stream is unavailable,
 * and the dropdown's list is refetched on window focus like everything else in this app. The `BellOff` +
 * `queryBoundary.emptyTitle`/`emptyDescription` empty state is shown only when the list is genuinely empty (not just fully read).
 * Each notification's text is shown in the reader's language (`useNotificationText`), falling back to the English the server stored.
 */
export function NotificationBell() {
  const t = useTranslations("shell.topbar");
  const tqb = useTranslations("queryBoundary");
  const tn = useTranslations("notifications");
  const router = useRouter();
  const locale = useLocale();
  useNotificationStream();
  const unreadCountQuery = useUnreadCount();
  const notificationsQuery = useNotifications({ pageSize: 8 });
  const markRead = useMarkNotificationRead();
  const markUnread = useMarkNotificationUnread();
  const markAllRead = useMarkAllNotificationsRead();

  const count = unreadCountQuery.data?.count ?? 0;
  const items = notificationsQuery.data?.items ?? [];

  function handleItemClick(notification: NotificationResponseDto) {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.link) router.push(notification.link);
  }

  function handleToggle(notification: NotificationResponseDto) {
    if (notification.readAt) markUnread.mutate(notification.id);
    else markRead.mutate(notification.id);
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
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-1rem)]">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <DropdownMenuLabel className="p-0">{t("notifications")}</DropdownMenuLabel>
          {count > 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
              {tn("markAllRead")}
            </Button>
          )}
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
                className={cn("items-start gap-1 whitespace-normal py-2", !item.readAt && "bg-tint-primary")}
              >
                <NotificationContent notification={item} timeLabel={relativeTime(new Date(item.createdAt), locale)} />
                <ReadToggle notification={item} onToggle={handleToggle} disabled={markRead.isPending || markUnread.isPending} />
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
