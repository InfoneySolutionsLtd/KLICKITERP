import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import type { NotificationEvent, NotificationParams, NotificationSink } from "../../../shared/notifications/notification-sink.port";
import { UsersService } from "../../users";
import { findNotificationEvent, isEssentialCategory } from "../domain/notification-catalogue";
import { NtfNotificationEntity } from "../domain/ntf-notification.entity";
import { NtfEventSettingRepository } from "../infrastructure/ntf-event-setting.repository";
import { NtfNotificationRepository } from "../infrastructure/ntf-notification.repository";
import { NtfUserPreferenceRepository } from "../infrastructure/ntf-user-preference.repository";
import { NotificationBusService } from "./notification-bus.service";

export interface NotifyInput {
  userId: string;
  /**
   * An open string, not a DB-constrained enum — the actual extensibility
   * mechanism a "generic" notification system needs: any future emitter
   * (billing, procurement, backups, ...) can introduce a brand-new `type`
   * with zero migration. A `type` that is in the catalogue
   * (`domain/notification-catalogue.ts`) also gets its category, the school's
   * on/off and each person's category preference applied; one that is not is
   * simply delivered.
   */
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** The values the text is built from, so the web app can show it in the reader's language. */
  params?: NotificationParams | null;
}

/** The most rows a single page may ask for: the dropdown asks for 8 and the full page grows by 20. */
export const MAX_PAGE_SIZE = 100;

interface Delivery {
  code: string;
  params?: NotificationParams | null;
  title?: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * The public surface of `platform/notifications` (this module's `index.ts` barrel exports only this — never the
 * repository/entity internals, matching `platform/comms`' own barrel doc comment convention), and the implementation of the
 * `NotificationSink` port every module raises notifications through (`shared/notifications/notification-sink.port.ts`).
 *
 * Two ways in, one delivery path:
 *  - `emit(event)` picks the RECIPIENTS from the event's catalogue audience (people holding the default permissions, or the
 *    roles the school chose, plus any named users);
 *  - `notify(input)` is for one named recipient (`platform/approvals`, which already knows its approvers).
 * Both then apply the school's switch for the event and each person's category preference (essential categories cannot be
 * switched off by the person), write the rows, and hint open bells. With an `EntityManager` the rows are written in the
 * caller's transaction, so a notification is committed (or rolled back) with the change that caused it; the hint to open
 * bells waits a moment so the refetch sees the commit.
 */
@Injectable()
export class NotifyService implements NotificationSink {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private readonly repo: NtfNotificationRepository,
    private readonly settings: NtfEventSettingRepository,
    private readonly preferences: NtfUserPreferenceRepository,
    private readonly users: UsersService,
    private readonly bus: NotificationBusService,
  ) {}

  /** One named recipient. `null` when the school switched the event off or the person switched its category off. */
  async notify(input: NotifyInput, manager?: EntityManager): Promise<NtfNotificationEntity | null> {
    const written = await this.deliver(
      [input.userId],
      { code: input.type, params: input.params, title: input.title, body: input.body ?? null, link: input.link, entityType: input.entityType, entityId: input.entityId },
      manager,
    );
    return written[0] ?? null;
  }

  async emit(event: NotificationEvent, manager?: EntityManager): Promise<number> {
    const run = async (): Promise<number> => {
      const recipients = await this.resolveRecipients(event, manager);
      const written = await this.deliver(recipients, event, manager);
      return written.length;
    };
    if (manager) return run();
    try {
      return await run();
    } catch (error) {
      this.logger.warn(`Notification ${event.code} could not be written: ${(error as Error).message}`);
      return 0;
    }
  }

  async listForUser(userId: string, options: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}): Promise<[NtfNotificationEntity[], number]> {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), MAX_PAGE_SIZE);
    return this.repo.listForUser(userId, { skip: (page - 1) * pageSize, take: pageSize, unreadOnly: options.unreadOnly });
  }

  async countUnread(userId: string): Promise<number> {
    return this.repo.countUnreadForUser(userId);
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.repo.markRead(id, userId);
  }

  async markUnread(id: string, userId: string): Promise<void> {
    await this.repo.markUnread(id, userId);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.markAllReadForUser(userId);
  }

  // ---------------------------------------------------------------------------------------------------------------

  /** Who gets an event: its named users, plus (for a permission audience) the school's chosen roles or else the default permission holders. */
  private async resolveRecipients(event: NotificationEvent, manager?: EntityManager): Promise<string[]> {
    const def = findNotificationEvent(event.code);
    const recipients = new Set<string>(event.userIds ?? []);

    if (def?.audience.kind === "permissions") {
      const setting = await this.settings.findByCode(def.code, manager);
      if (setting && !setting.isEnabled) return [];
      const chosenRoles = def.audienceManagedElsewhere ? [] : (setting?.roleIds ?? []);
      const people =
        chosenRoles.length > 0
          ? await this.users.listActiveUserIdsInRoles(chosenRoles, manager)
          : await this.users.listActiveUserIdsWithPermissions([...def.audience.permissions], manager);
      for (const id of people) recipients.add(id);
    }

    for (const id of event.excludeUserIds ?? []) recipients.delete(id);
    return [...recipients];
  }

  private async deliver(userIds: string[], event: Delivery, manager?: EntityManager): Promise<NtfNotificationEntity[]> {
    const def = findNotificationEvent(event.code);
    if (def) {
      const setting = await this.settings.findByCode(def.code, manager);
      if (setting && !setting.isEnabled) return [];
    }

    let targets = [...new Set(userIds)];
    if (def && !isEssentialCategory(def.category)) {
      const off = await this.preferences.findUserIdsWithCategoryOff(targets, def.category, manager);
      targets = targets.filter((id) => !off.has(id));
    }
    if (targets.length === 0) return [];

    const params = event.params ?? null;
    const title = (event.title ?? def?.fallbackTitle ?? event.code).slice(0, 200);
    const body = event.body !== undefined ? event.body : def ? def.fallbackBody(params ?? {}) : null;
    const written = await this.repo.createMany(
      targets.map((userId) => ({
        userId,
        type: event.code,
        category: def?.category ?? null,
        params,
        title,
        body,
        link: event.link ? event.link.slice(0, 300) : null,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        readAt: null as null,
      })),
      manager,
    );
    this.bus.publishSoon(targets);
    return written;
  }
}
