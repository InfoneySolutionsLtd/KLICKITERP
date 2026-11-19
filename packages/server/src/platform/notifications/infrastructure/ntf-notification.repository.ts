import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import type { NotificationParams } from "../../../shared/notifications/notification-sink.port";
import { NtfNotificationEntity } from "../domain/ntf-notification.entity";

export interface CreateNotificationData {
  userId: string;
  type: string;
  category: string | null;
  params: NotificationParams | null;
  title: string;
  body: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: null;
}

export interface ListNotificationsOptions {
  skip?: number;
  take?: number;
  /** Only the ones not read yet. */
  unreadOnly?: boolean;
}

@Injectable()
export class NtfNotificationRepository {
  constructor(
    @InjectRepository(NtfNotificationEntity)
    private readonly repo: Repository<NtfNotificationEntity>,
  ) {}

  async create(data: CreateNotificationData, manager?: EntityManager): Promise<NtfNotificationEntity> {
    const repo = manager?.getRepository(NtfNotificationEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  /** One insert for several recipients of the same event. */
  async createMany(data: CreateNotificationData[], manager?: EntityManager): Promise<NtfNotificationEntity[]> {
    if (data.length === 0) return [];
    const repo = manager?.getRepository(NtfNotificationEntity) ?? this.repo;
    return repo.save(data.map((row) => repo.create(row)));
  }

  /** Newest first — backs both the bell dropdown and the full `/notifications` page. */
  async listForUser(userId: string, options: ListNotificationsOptions = {}): Promise<[NtfNotificationEntity[], number]> {
    const qb = this.repo.createQueryBuilder("n").where("n.userId = :userId", { userId }).orderBy("n.createdAt", "DESC");
    if (options.unreadOnly) qb.andWhere("n.readAt IS NULL");
    if (options.skip !== undefined) qb.skip(options.skip);
    if (options.take !== undefined) qb.take(options.take);
    return qb.getManyAndCount();
  }

  /** Hits the partial `ix_ntf_notification_user_unread` index. */
  async countUnreadForUser(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, readAt: IsNull() } });
  }

  /** Ownership check baked into the WHERE clause, not just the service layer — a direct UPDATE, not load-then-save, since marking read is idempotent and harmless to race. */
  async markRead(id: string, userId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(NtfNotificationEntity)
      .set({ readAt: () => "now()" })
      .where("id = :id AND user_id = :userId AND read_at IS NULL", { id, userId })
      .execute();
  }

  /** Puts a notification back to unread (so it stands out again). Same ownership-in-the-WHERE rule as `markRead`. */
  async markUnread(id: string, userId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(NtfNotificationEntity)
      .set({ readAt: null })
      .where("id = :id AND user_id = :userId AND read_at IS NOT NULL", { id, userId })
      .execute();
  }

  async markAllReadForUser(userId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(NtfNotificationEntity)
      .set({ readAt: () => "now()" })
      .where("user_id = :userId AND read_at IS NULL", { userId })
      .execute();
  }
}
