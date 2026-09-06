import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NtfNotificationEntity } from "./domain/ntf-notification.entity";
import { NtfNotificationRepository } from "./infrastructure/ntf-notification.repository";
import { NotifyService } from "./application/notify.service";
import { NotificationsController } from "./api/notifications.controller";

/**
 * A real, generic per-user notification inbox (migration `0256`) —
 * `platform/approvals` is its first, real emitter (see
 * `ApprovalEngineService`'s own doc comment for the three emission points),
 * imported one-directionally the same way `domains/reporting`/`domains/
 * procurement`/`domains/integrations` already import `platform/comms`.
 * Exports only `NotifyService` via `index.ts` — never the repository/entity
 * internals, matching `platform/comms`' own barrel doc comment convention.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NtfNotificationEntity])],
  controllers: [NotificationsController],
  providers: [NtfNotificationRepository, NotifyService],
  exports: [NotifyService],
})
export class NotificationsModule {}
