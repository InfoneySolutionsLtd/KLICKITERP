/**
 * Public barrel — the only surface any sibling module should import from
 * (`crossSiblingImportPolicy` in module-deps.json), mirroring `platform/
 * comms`' own barrel doc comment: a future module wanting to raise a
 * notification imports `NotifyService` from here and calls `.notify()` —
 * never this module's repository/entity internals directly.
 */
export { NotificationsModule } from "./notifications.module";
export { NotifyService } from "./application/notify.service";
export type { NotifyInput } from "./application/notify.service";
export { NtfNotificationEntity } from "./domain/ntf-notification.entity";
export type { KnownNotificationType } from "./domain/ntf-notification.entity";
