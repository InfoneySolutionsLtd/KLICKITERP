import type { EntityManager } from "typeorm";

/**
 * Where any module raises an in-app (bell) notification, as other modules may see it.
 *
 * `platform/notifications` owns the inbox and provides the implementation (`NotifyService`, through a `@Global` module).
 * Modules depend on THIS port in `shared/` instead of importing `platform/notifications`: `licensing` may import `shared`
 * only, and most domain modules are not allowed to import `platform/notifications` (`module-deps.json`). Inject it as
 * `@Optional() @Inject(NOTIFICATION_SINK)` so a unit test (or a process without the inbox) simply gets no notifications.
 *
 * `code` names an event in the notification catalogue (`platform/notifications/domain/notification-catalogue.ts`), which
 * decides the category, whether the school has switched it off, and who receives it by default.
 */
export const NOTIFICATION_SINK = Symbol("NOTIFICATION_SINK");

/** Plain values only: they are stored with the notification and used to build its text in the reader's language. */
export type NotificationParams = Record<string, string | number | boolean | null>;

export interface NotificationEvent {
  /** An event code from the catalogue, e.g. `CHEQUE_BOUNCED`. An unknown code is still delivered (to `userIds` only). */
  code: string;
  /** What the text says: names, amounts, numbers. Never put anything secret here: the row is readable by its recipient. */
  params?: NotificationParams;
  /** English fallback shown where no translation exists. Optional: the catalogue builds one from `params`. */
  title?: string;
  body?: string | null;
  /** Where clicking the notification goes (an app-relative path such as `/billing/invoices/<id>`). */
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /**
   * Named recipients. For events whose audience is "explicit" (approvals, your own bulk run, a security alert about you)
   * these are the ONLY recipients; for the others they are added to the people the school's settings / default
   * permissions select.
   */
  userIds?: string[];
  /** Never notified (usually the person who did the thing). */
  excludeUserIds?: string[];
}

export interface NotificationSink {
  /**
   * Notifies the people the event's audience selects. Pass the caller's `EntityManager` when it has a transaction, so the
   * notification is committed (or rolled back) together with the change that caused it. It NEVER throws into the caller: with a
   * transaction its writes run in a savepoint, so a failure undoes only the notification and the caller's transaction carries on;
   * without one a failure is logged. Resolves to the number of notifications written (0 when none, or when it failed).
   */
  emit(event: NotificationEvent, manager?: EntityManager): Promise<number>;
}
