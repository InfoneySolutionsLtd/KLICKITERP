import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { NtfNotificationEntity } from "../domain/ntf-notification.entity";
import { NtfNotificationRepository } from "../infrastructure/ntf-notification.repository";

export interface NotifyInput {
  userId: string;
  /**
   * An open string, not a DB-constrained enum — the actual extensibility
   * mechanism a "generic" notification system needs: any future emitter
   * (billing, procurement, backups, ...) can introduce a brand-new `type`
   * with zero migration. `KnownNotificationType` (the entity's own export)
   * gives compile-time safety to callers that know their type ahead of
   * time (like `platform/approvals`) without constraining anyone else.
   */
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * The public surface of `platform/notifications` (this module's `index.ts`
 * barrel exports only this — never the repository/entity internals,
 * matching `platform/comms`' own barrel doc comment convention). `notify()`
 * takes an optional `EntityManager`, the same shape `CommMessageRepository`
 * already establishes — every current call site (`ApprovalEngineService`'s
 * `submit()`/`decide()`) always supplies one, so the notification commits
 * atomically with the approval-state change that caused it, never orphaned
 * by a later rollback.
 */
@Injectable()
export class NotifyService {
  constructor(private readonly repo: NtfNotificationRepository) {}

  async notify(input: NotifyInput, manager?: EntityManager): Promise<NtfNotificationEntity> {
    return this.repo.create(
      {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        readAt: null,
      },
      manager,
    );
  }

  async listForUser(userId: string, options: { page?: number; pageSize?: number } = {}): Promise<[NtfNotificationEntity[], number]> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    return this.repo.listForUser(userId, { skip: (page - 1) * pageSize, take: pageSize });
  }

  async countUnread(userId: string): Promise<number> {
    return this.repo.countUnreadForUser(userId);
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.repo.markRead(id, userId);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.markAllReadForUser(userId);
  }
}
