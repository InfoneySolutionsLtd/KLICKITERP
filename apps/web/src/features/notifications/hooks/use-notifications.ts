"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ListNotificationsParams,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications.api";

const KEY = ["notifications"] as const;

/**
 * `refetchInterval: 60_000` — this app's first-ever polling. No websocket/
 * SSE infrastructure exists anywhere in this codebase (confirmed while
 * researching this feature); a 60s poll on this one cheap, indexed
 * COUNT-only endpoint is the realistic "live" option for a bell badge
 * without building real-time infrastructure from scratch.
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
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
