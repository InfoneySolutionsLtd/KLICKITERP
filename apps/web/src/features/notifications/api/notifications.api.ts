import type {
  ListNotificationsResponseDto,
  NotificationEventSettingDto,
  NotificationEventSettingsResponseDto,
  NotificationPreferencesResponseDto,
  UnreadCountResponseDto,
  UpdateNotificationEventSettingDto,
  UpdateNotificationPreferenceDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `NotificationsController` and `NotificationSettingsController`
 * (`packages/server/src/platform/notifications/api/`). The bell routes have no
 * `@RequirePermission`: always scoped to the caller's own `req.user.sub`, never a
 * cross-user admin view. The school's per-event settings (`/notifications/settings`)
 * need the Communications trigger-binding permissions.
 */
export interface ListNotificationsParams {
  page?: number;
  pageSize?: number;
  /** Only the ones not read yet. */
  unreadOnly?: boolean;
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

export async function markNotificationUnread(id: string): Promise<void> {
  unwrapApiResult(await apiClient.POST("/api/v1/notifications/{id}/unread", { params: { path: { id } } }));
}

export async function markAllNotificationsRead(): Promise<void> {
  unwrapApiResult(await apiClient.POST("/api/v1/notifications/read-all"));
}

export async function getNotificationPreferences(): Promise<NotificationPreferencesResponseDto> {
  return unwrapApiResult<NotificationPreferencesResponseDto>(await apiClient.GET("/api/v1/notifications/preferences"));
}

export async function setNotificationPreference(body: UpdateNotificationPreferenceDto): Promise<NotificationPreferencesResponseDto> {
  return unwrapApiResult<NotificationPreferencesResponseDto>(await apiClient.PUT("/api/v1/notifications/preferences", { body }));
}

export async function getNotificationSettings(): Promise<NotificationEventSettingsResponseDto> {
  return unwrapApiResult<NotificationEventSettingsResponseDto>(await apiClient.GET("/api/v1/notifications/settings"));
}

export async function updateNotificationSetting(eventCode: string, body: UpdateNotificationEventSettingDto): Promise<NotificationEventSettingDto> {
  return unwrapApiResult<NotificationEventSettingDto>(
    await apiClient.PUT("/api/v1/notifications/settings/{eventCode}", { params: { path: { eventCode } }, body }),
  );
}
