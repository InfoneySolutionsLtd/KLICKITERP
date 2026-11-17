import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { StdClassEntity, StdStreamEntity } from "../../students";

export type AcadClassMapKind = "LEVEL" | "STREAM";
export const ACAD_CLASS_MAP_KINDS: readonly AcadClassMapKind[] = ["LEVEL", "STREAM"];

/**
 * Maps to `acad_class_map` — an Academy level (a class such as "Grade 4") or stream onto the ERP's `std_class` /
 * `std_stream`. Resolution order when a student arrives: an existing mapping row, else the ERP class/stream with the
 * same name (adopted, `autoCreated=false`), else a new ERP class/stream is created (`autoCreated=true`). The mapping is
 * keyed by the Academy's ids, so renaming a class on either side does not break it.
 *
 * A LEVEL row has only `classId`; a STREAM row has the `classId` it sits under and its `streamId`.
 */
@Entity("acad_class_map")
@Index("uq_acad_class_map_academy", ["kind", "academyId"], { unique: true })
@Check("ck_acad_class_map_kind", `"kind" IN ('LEVEL','STREAM')`)
@Check(
  "ck_acad_class_map_shape",
  `("kind" = 'LEVEL' AND "stream_id" IS NULL) OR ("kind" = 'STREAM' AND "stream_id" IS NOT NULL)`,
)
export class AcadClassMapEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 10, name: "kind" })
  kind!: AcadClassMapKind;

  @Column({ type: "varchar", length: 64, name: "academy_id" })
  academyId!: string;

  @Column({ type: "varchar", length: 120, name: "academy_name" })
  academyName!: string;

  @Column({ type: "uuid", name: "class_id" })
  classId!: string;

  @ManyToOne(() => StdClassEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "class_id" })
  klass?: StdClassEntity;

  @Column({ type: "uuid", name: "stream_id", nullable: true })
  streamId!: string | null;

  @ManyToOne(() => StdStreamEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "stream_id" })
  stream?: StdStreamEntity | null;

  @Column({ type: "boolean", name: "auto_created", default: false })
  autoCreated!: boolean;
}
