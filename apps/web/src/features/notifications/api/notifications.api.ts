import type { ListNotificationsResponseDto, UnreadCountResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `NotificationsController`
 * (`packages/server/src/platform/notifications/api/notifications.controller.ts`).
 * No `@RequirePermission` on any of these routes server-side — always
 * scoped to the caller's own `req.user.sub`, never a cross-user admin view.
 */
export interface ListNotificationsParams {
  page?: number;
  pageSize?: number;
}

export async function listNotifications(params: ListNotificationsParams = {}): Promise<ListNotificationsResponseDto> {
  return unwrapApiResult<ListNotificationsResponseDto>(
    await apiClient.GET("/api/v1/notifications", { params: { query: params } }),
  );
}

export async function getUnreadCount(): Promise<UnreadCountResponseDto> {
  return unwrapApiResult<UnreadCountResponseDto>(await apiClient.GET("/api/v1/notifications/unread-count"));
}

export async function markNotificationRead(id: string): Promise<void> {
  unwrapApiResult(await apiClient.POST("/api/v1/notifications/{id}/read", { params: { path: { id } } }));
}

export async function markAllNotificationsRead(): Promise<void> {
  unwrapApiResult(await apiClient.POST("/api/v1/notifications/read-all"));
}
