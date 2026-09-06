"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { NotificationResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/features/notifications/hooks/use-notifications";
import { cn } from "@/lib/utils";

const PAGE_SIZE_STEP = 20;

const LOCALIZED_TYPES = new Set(["APPROVAL_PENDING", "APPROVAL_APPROVED", "APPROVAL_REJECTED", "APPROVAL_RETURNED"]);

/**
 * Full paginated history, reached only via the topbar bell's "View all"
 * link — not added to `nav-links.tsx`, the same "not a primary nav
 * destination" precedent `/my-devices` already established (reached from
 * the user menu instead of the sidebar). "Load more" grows a local
 * `pageSize` rather than true page-replace navigation — simplest fit for an
 * activity feed, matching this page's own `loadMore` i18n key.
 */
export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE_STEP);
  const query = useNotifications({ page: 1, pageSize });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  function titleFor(notification: NotificationResponseDto): string {
    return LOCALIZED_TYPES.has(notification.type) ? t(`types.${notification.type}.title` as Parameters<typeof t>[0]) : notification.title;
  }

  function handleItemClick(notification: NotificationResponseDto) {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.link) router.push(notification.link);
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
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("pageTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={query} isEmpty={(d) => d.items.length === 0}>
            {(data) => (
              <div className="space-y-4">
                <div className="divide-y divide-border">
                  {data.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 px-2 py-3 text-left transition-colors hover:bg-muted",
                        !item.readAt && "bg-tint-primary",
                      )}
                    >
                      <div className="flex w-full items-center gap-2">
                        {!item.readAt && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />}
                        <span className="text-sm font-medium text-foreground">{titleFor(item)}</span>
                      </div>
                      {item.body && <p className="pl-3.5 text-sm text-muted-foreground">{item.body}</p>}
                      <p className="pl-3.5 text-xs text-muted-foreground/70">{new Date(item.createdAt).toLocaleString()}</p>
                    </button>
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
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
