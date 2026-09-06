import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import { NtfNotificationEntity } from "../domain/ntf-notification.entity";

export interface CreateNotificationData {
  userId: string;
  type: string;
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

  /** Newest first — backs both the bell dropdown and the full `/notifications` page. */
  async listForUser(userId: string, options: ListNotificationsOptions = {}): Promise<[NtfNotificationEntity[], number]> {
    const qb = this.repo.createQueryBuilder("n").where("n.userId = :userId", { userId }).orderBy("n.createdAt", "DESC");
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

  async markAllReadForUser(userId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(NtfNotificationEntity)
      .set({ readAt: () => "now()" })
      .where("user_id = :userId AND read_at IS NULL", { userId })
      .execute();
  }
}
