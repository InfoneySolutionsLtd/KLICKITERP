import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../users";
import type { NotificationParams } from "../../../shared/notifications/notification-sink.port";
import type { NotificationEventCode } from "./notification-catalogue";

/**
 * Known `type` values this codebase currently emits: the codes in `notification-catalogue.ts`. See
 * `application/notify.service.ts`'s own doc comment for why `type` is NOT a DB CHECK constraint: any future emitter
 * can introduce a brand-new string with zero migration. This alias exists purely for compile-time safety on the literals
 * callers know ahead of time; it is not exhaustive by design.
 */
export type KnownNotificationType = NotificationEventCode;

/**
 * Maps to `ntf_notification` (migration `0256`) — a real per-user
 * notification inbox with read/unread state, replacing the topbar bell's
 * previous "honestly empty, no real signal" placeholder. `user_id` FK to
 * `usr_user` (RESTRICT, imported via `platform/users`' public barrel — same
 * one-directional-dependency precedent `platform/comms`' own
 * `CommDeviceTokenEntity` already establishes, see module-deps.json's
 * `platform/notifications` entry). `read_at` null = unread; set = read —
 * the simplest possible read-state model, no separate `is_read` boolean
 * that could drift from it.
 */
@Entity("ntf_notification")
@Index("ix_ntf_notification_user_unread", ["userId"], { where: '"read_at" IS NULL' })
@Index("ix_ntf_notification_user_created", ["userId", "createdAt"])
export class NtfNotificationEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user?: UsrUserEntity;

  @Column({ type: "varchar", length: 60, name: "type" })
  type!: string;

  /** The catalogue category of `type`, kept on the row so "switch this category off" is a plain filter. `null` for a type outside the catalogue. */
  @Column({ type: "varchar", length: 30, name: "category", nullable: true })
  category!: string | null;

  /** The values the notification's text is built from (names, amounts, numbers), so the reader sees it in their own language. */
  @Column({ type: "jsonb", name: "params", nullable: true })
  params!: NotificationParams | null;

  @Column({ type: "varchar", length: 200, name: "title" })
  title!: string;

  @Column({ type: "text", name: "body", nullable: true })
  body!: string | null;

  @Column({ type: "varchar", length: 300, name: "link", nullable: true })
  link!: string | null;

  @Column({ type: "varchar", length: 60, name: "entity_type", nullable: true })
  entityType!: string | null;

  @Column({ type: "uuid", name: "entity_id", nullable: true })
  entityId!: string | null;

  @Column({ type: "timestamptz", name: "read_at", nullable: true })
  readAt!: Date | null;
}
