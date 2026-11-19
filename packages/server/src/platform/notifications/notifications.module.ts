import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NOTIFICATION_SINK } from "../../shared/notifications/notification-sink.port";
import { UsersModule } from "../users";
import { NtfEventSettingEntity } from "./domain/ntf-event-setting.entity";
import { NtfNotificationEntity } from "./domain/ntf-notification.entity";
import { NtfUserPreferenceEntity } from "./domain/ntf-user-preference.entity";
import { NtfEventSettingRepository } from "./infrastructure/ntf-event-setting.repository";
import { NtfNotificationRepository } from "./infrastructure/ntf-notification.repository";
import { NtfUserPreferenceRepository } from "./infrastructure/ntf-user-preference.repository";
import { NotificationBusService } from "./application/notification-bus.service";
import { NotificationPreferencesService } from "./application/notification-preferences.service";
import { NotificationSettingsService } from "./application/notification-settings.service";
import { NotifyService } from "./application/notify.service";
import { NotificationSettingsController } from "./api/notification-settings.controller";
import { NotificationsController } from "./api/notifications.controller";

/**
 * The bell's inbox, its catalogue of events, the school's per-event switches and each person's category preferences
 * (migrations `0256`, `0271`). `@Global()` so the `NOTIFICATION_SINK` port (`shared/notifications`) resolves in every
 * module, including `licensing`, which may import `shared` only: any module raises a notification with
 * `@Optional() @Inject(NOTIFICATION_SINK)` and never imports this module. `platform/approvals` still imports it directly
 * and calls `NotifyService.notify()`, as before.
 *
 * Exports `NotifyService` (and the sink token) via `index.ts` — never the repository/entity internals, matching
 * `platform/comms`' own barrel doc comment convention.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([NtfNotificationEntity, NtfEventSettingEntity, NtfUserPreferenceEntity]), UsersModule],
  controllers: [NotificationsController, NotificationSettingsController],
  providers: [
    NtfNotificationRepository,
    NtfEventSettingRepository,
    NtfUserPreferenceRepository,
    NotificationBusService,
    NotifyService,
    NotificationPreferencesService,
    NotificationSettingsService,
    { provide: NOTIFICATION_SINK, useExisting: NotifyService },
  ],
  exports: [NotifyService, NOTIFICATION_SINK],
})
export class NotificationsModule {}
