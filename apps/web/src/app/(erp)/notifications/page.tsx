"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { NotificationResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { NotificationContent, ReadToggle } from "@/features/notifications/components/notification-parts";
import { NotificationPreferencesCard } from "@/features/notifications/components/notification-preferences-card";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useNotifications,
} from "@/features/notifications/hooks/use-notifications";
import { cn } from "@/lib/utils";

const PAGE_SIZE_STEP = 20;

/**
 * Full paginated history, reached only via the topbar bell's "View all"
 * link — not added to `nav-links.tsx`, the same "not a primary nav
 * destination" precedent `/my-devices` already established (reached from
 * the user menu instead of the sidebar). "Load more" grows a local
 * `pageSize` rather than true page-replace navigation — simplest fit for an
 * activity feed, matching this page's own `loadMore` i18n key. "All / Unread"
 * filters on the server (`unreadOnly`), and the person's own notification
 * preferences (which categories reach their bell) sit below the list.
 */
export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE_STEP);
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const query = useNotifications({ page: 1, pageSize, unreadOnly });
  const markRead = useMarkNotificationRead();
  const markUnread = useMarkNotificationUnread();
  const markAllRead = useMarkAllNotificationsRead();

  function handleItemClick(notification: NotificationResponseDto) {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.link) router.push(notification.link);
  }

  function handleToggle(notification: NotificationResponseDto) {
    if (notification.readAt) markUnread.mutate(notification.id);
    else markRead.mutate(notification.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
          {t("markAllRead")}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base text-foreground">{t("pageTitle")}</CardTitle>
          <div role="group" aria-label={t("pageTitle")} className="inline-flex rounded-lg border border-border p-0.5">
            {([false, true] as const).map((onlyUnread) => (
              <Button
                key={String(onlyUnread)}
                type="button"
                size="sm"
                variant={unreadOnly === onlyUnread ? "default" : "ghost"}
                aria-pressed={unreadOnly === onlyUnread}
                className="h-7 px-3 text-xs"
                onClick={() => {
                  setUnreadOnly(onlyUnread);
                  setPageSize(PAGE_SIZE_STEP);
                }}
              >
                {onlyUnread ? t("filter.unread") : t("filter.all")}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {/* Nothing at all gets the standard empty state; "no unread" is a good thing and says so in its own words. */}
          <QueryBoundary query={query} isEmpty={(d) => d.items.length === 0 && !unreadOnly}>
            {(data) =>
              data.items.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("emptyUnread")}</p>
              ) : (
              <div className="space-y-4">
                <div className="divide-y divide-border">
                  {data.items.map((item) => (
                    <div key={item.id} className={cn("flex items-start gap-1 px-2 py-3 transition-colors hover:bg-muted", !item.readAt && "bg-tint-primary")}>
                      <button type="button" onClick={() => handleItemClick(item)} className="min-w-0 flex-1 text-left">
                        <NotificationContent notification={item} timeLabel={new Date(item.createdAt).toLocaleString()} bodyClassName="text-sm" />
                      </button>
                      <ReadToggle notification={item} onToggle={handleToggle} disabled={markRead.isPending || markUnread.isPending} />
                    </div>
                  ))}
                </div>
                {data.items.length < data.meta.total && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => setPageSize((s) => s + PAGE_SIZE_STEP)}>
                      {t("loadMore")}
                    </Button>
                  </div>
                )}
              </div>
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>

      <NotificationPreferencesCard />
    </div>
  );
}
