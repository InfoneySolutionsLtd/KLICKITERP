import type { NotificationSink } from "../../shared/notifications/notification-sink.port";

/**
 * Tells the people who can see the Licence page that the licence changed state (ACTIVE -> GRACE, GRACE -> SUSPENDED, ...), through the
 * `NOTIFICATION_SINK` port in `shared/` (`licensing` may import `shared` only). Does nothing when nothing changed or when this process
 * has no inbox, and never throws: a notification problem must not undo or fail a licence change.
 */
export async function notifyLicenceStateChange(
  sink: NotificationSink | undefined,
  change: { from: string; to: string; validTo?: string | null },
): Promise<void> {
  if (!sink || change.from === change.to) return;
  await sink.emit({
    code: "LICENCE_STATE_CHANGED",
    params: { from: change.from, to: change.to, validTo: change.validTo ?? null },
    link: "/license",
    entityType: "license",
  });
}
