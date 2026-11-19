import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../users";

/**
 * Maps to `ntf_user_preference` (migration `0271`): one person's choice for one notification category in their OWN bell.
 * A missing row means "on". Only non-essential categories can be switched off (`notification-catalogue.ts`); the service
 * refuses the rest, and delivery ignores a stored "off" for an essential category as defence in depth.
 */
@Entity("ntf_user_preference")
@Index("uq_ntf_user_preference_user_category", ["userId", "category"], { unique: true })
export class NtfUserPreferenceEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user?: UsrUserEntity;

  @Column({ type: "varchar", length: 30, name: "category" })
  category!: string;

  @Column({ type: "boolean", name: "is_enabled", default: true })
  isEnabled!: boolean;
}
