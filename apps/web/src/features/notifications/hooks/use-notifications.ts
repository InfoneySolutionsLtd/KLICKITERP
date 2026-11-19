"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ListNotificationsParams,
  getNotificationPreferences,
  getNotificationSettings,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  setNotificationPreference,
  updateNotificationSetting,
} from "../api/notifications.api";

export const NOTIFICATIONS_KEY = ["notifications"] as const;
const KEY = NOTIFICATIONS_KEY;

/**
 * `refetchInterval: 60_000` — the FALLBACK. New notifications normally arrive within a second or two through the live
 * stream (`useNotificationStream`), which only tells this query to ask again; this poll on one cheap, indexed COUNT-only
 * endpoint keeps the badge right when the stream is unavailable (a proxy that buffers, a dropped connection, a hidden tab).
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: [...KEY, "unread-count"] as const,
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });
}

export function useNotifications(params: ListNotificationsParams = {}) {
  return useQuery({
    queryKey: [...KEY, "list", params] as const,
    queryFn: () => listNotifications(params),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { toast: false },
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkNotificationUnread() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { toast: false },
    mutationFn: markNotificationUnread,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { toast: false },
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

// ---- the person's own preferences ---------------------------------------------------------------------------------

export function useNotificationPreferences() {
  return useQuery({ queryKey: [...KEY, "preferences"] as const, queryFn: getNotificationPreferences });
}

export function useSetNotificationPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successKey: "notifications.preferences.toast.saved" },
    mutationFn: setNotificationPreference,
    onSuccess: (data) => queryClient.setQueryData([...KEY, "preferences"], data),
  });
}

// ---- the school's settings per event (admin) -----------------------------------------------------------------------

/** Not retried: a 403 (no permission to look) simply renders as "not allowed". */
export function useNotificationSettings() {
  return useQuery({ queryKey: [...KEY, "settings"] as const, queryFn: getNotificationSettings, retry: false });
}

export function useUpdateNotificationSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successKey: "notifications.settings.toast.saved" },
    mutationFn: (input: { eventCode: string; isEnabled?: boolean; roleIds?: string[] }) => {
      const { eventCode, ...body } = input;
      return updateNotificationSetting(eventCode, body);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, "settings"] }),
  });
}
