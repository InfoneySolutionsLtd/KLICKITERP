import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { StdGuardianEntity } from "../../students";

/**
 * Maps to `acad_guardian_map` — which Academy parent is which ERP guardian. Several Academy parents may resolve to one
 * guardian (same phone number), so only `academy_parent_id` is unique.
 */
@Entity("acad_guardian_map")
@Index("uq_acad_guardian_map_academy", ["academyParentId"], { unique: true })
@Index("ix_acad_guardian_map_guardian", ["guardianId"])
export class AcadGuardianMapEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "guardian_id" })
  guardianId!: string;

  @ManyToOne(() => StdGuardianEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "guardian_id" })
  guardian?: StdGuardianEntity;

  @Column({ type: "varchar", length: 64, name: "academy_parent_id" })
  academyParentId!: string;

  @Column({ type: "timestamptz", name: "last_seen_at" })
  lastSeenAt!: Date;
}
