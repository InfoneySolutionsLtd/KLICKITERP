"use client";

import * as React from "react";
import { Mail, MailOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import type { NotificationResponseDto } from "@klickit/contracts";
import { cn } from "@/lib/utils";
import { useNotificationText } from "../notification-text";

/** The text of one notification: an unread dot, the title, the body and when it arrived (relative in the bell, absolute on the page). */
export function NotificationContent({ notification, timeLabel, bodyClassName }: { notification: NotificationResponseDto; timeLabel: string; bodyClassName?: string }) {
  const textOf = useNotificationText();
  const text = textOf(notification);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex w-full items-center gap-2">
        {!notification.readAt && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />}
        <span className={cn("text-sm text-foreground", notification.readAt ? "font-normal" : "font-medium")}>{text.title}</span>
      </div>
      {text.body && <p className={cn("pl-3.5 text-muted-foreground", bodyClassName ?? "text-xs")}>{text.body}</p>}
      <p className="pl-3.5 text-[11px] text-muted-foreground/70">{timeLabel}</p>
    </div>
  );
}

/**
 * Marks one notification read or unread. Stops the click here so it does not also open the notification (or, inside the bell's
 * menu, select the item and close the menu).
 */
export function ReadToggle({ notification, onToggle, disabled }: { notification: NotificationResponseDto; onToggle: (notification: NotificationResponseDto) => void; disabled?: boolean }) {
  const t = useTranslations("notifications");
  const isRead = Boolean(notification.readAt);
  const label = isRead ? t("markUnread") : t("markRead");
  const Icon = isRead ? Mail : MailOpen;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      onClick={(event) => {
        // Only the click is stopped, not the pointer-down: Radix menu items treat a pointer-up they did not see the
        // pointer-down of as "select me", which would open the notification and close the menu anyway.
        event.stopPropagation();
        event.preventDefault();
        onToggle(notification);
      }}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
