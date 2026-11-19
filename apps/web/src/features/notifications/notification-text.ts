"use client";

import * as React from "react";
import { useMessages, useTranslations } from "next-intl";
import type { NotificationResponseDto } from "@klickit/contracts";

export interface NotificationText {
  title: string;
  body: string | null;
}

type IcuValues = Record<string, string | number>;

/**
 * The values a notification's message is formatted with. Numbers stay numbers (a plural needs one); a missing or null value
 * becomes a dash, except the parent's name, which becomes "A parent" so the sentence still reads naturally.
 */
export function icuValues(params: Record<string, unknown> | null | undefined, fallbacks: { parentName: string; value: string }): IcuValues {
  const values: IcuValues = { parentName: fallbacks.parentName };
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === "number") values[key] = value;
    else if (typeof value === "string" && value !== "") values[key] = value;
    else if (typeof value === "boolean") values[key] = String(value);
    else values[key] = key === "parentName" ? fallbacks.parentName : fallbacks.value;
  }
  return values;
}

/**
 * What to show for a notification, in the reader's language.
 *
 * A type with a translation (`notifications.types.<TYPE>`, one per catalogue event, kept in step by a server test) is shown
 * from its translated title, and its translated body when the notification carries `params` to fill it with. A notification
 * with no translation (a type a later release added) or no params (one written before params existed) shows the English text
 * the server stored with it, so nothing is ever blank or mistranslated.
 */
export function useNotificationText(): (notification: NotificationResponseDto) => NotificationText {
  const t = useTranslations("notifications");
  const messages = useMessages() as { notifications?: { types?: Record<string, unknown> } };
  const known = messages.notifications?.types ?? {};
  const fallbacks = { parentName: t("defaults.parentName"), value: t("defaults.value") };

  return React.useCallback(
    (notification) => {
      if (!(notification.type in known)) return { title: notification.title, body: notification.body };
      const title = t(`types.${notification.type}.title` as Parameters<typeof t>[0]);
      if (!notification.params) return { title, body: notification.body };
      try {
        return { title, body: t(`types.${notification.type}.body` as Parameters<typeof t>[0], icuValues(notification.params, fallbacks)) };
      } catch {
        return { title, body: notification.body };
      }
    },
    // `fallbacks` is rebuilt every render from `t`; depending on `t` and `known` is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, known],
  );
}
