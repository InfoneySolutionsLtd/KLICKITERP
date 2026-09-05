import { Injectable } from "@nestjs/common";
import { NotificationsService } from "../../comms";
import { NotificationMessage, NotificationPort } from "./notification-port";

/**
 * Real `NotificationPort` implementation, replacing `LogOnlyAdapter` now
 * that `platform/comms` exists (see that file's own doc comment for why it
 * was a stub in the first place — comms didn't exist yet when auth's
 * OTP/password-reset flows were built). Delegates to comms' own public,
 * already-reused-elsewhere `NotificationsService.send()` — the same
 * primitive `PaymentVouchersService` (remittance advice email) and
 * `ReportSchedulesService` (scheduled report delivery) already call for an
 * arbitrary, non-student/guardian recipient. If no real SMTP is configured
 * for a tenant, `NotificationsService`'s own adapter resolution already
 * falls back to a log-only send — this wiring is safe with zero config too.
 */
@Injectable()
export class CommsNotificationAdapter implements NotificationPort {
  constructor(private readonly notifications: NotificationsService) {}

  async send(message: NotificationMessage): Promise<void> {
    await this.notifications.send({
      channel: message.channel,
      recipient: message.to,
      subject: message.subject,
      body: message.body,
    });
  }
}
