/**
 * Public barrel — the only surface any sibling module should import from
 * (`crossSiblingImportPolicy` in module-deps.json), mirroring `platform/
 * comms`' own barrel doc comment: a module that already imports this one calls
 * `NotifyService.notify()`/`.emit()`; every other module raises a notification
 * through the `NOTIFICATION_SINK` port in `shared/notifications` instead — never
 * this module's repository/entity internals directly.
 */
export { NotificationsModule } from "./notifications.module";
export { NotifyService } from "./application/notify.service";
export type { NotifyInput } from "./application/notify.service";
export { NtfNotificationEntity } from "./domain/ntf-notification.entity";
export type { KnownNotificationType } from "./domain/ntf-notification.entity";
export { NtfEventSettingEntity } from "./domain/ntf-event-setting.entity";
export { NtfUserPreferenceEntity } from "./domain/ntf-user-preference.entity";
export { NOTIFICATION_CATEGORIES, NOTIFICATION_EVENTS, findNotificationEvent } from "./domain/notification-catalogue";
export type { NotificationCategory, NotificationEventCode, NotificationEventDef } from "./domain/notification-catalogue";
