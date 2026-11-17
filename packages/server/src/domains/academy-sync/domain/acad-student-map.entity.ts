import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { StdStudentEntity } from "../../students";

export type AcadStudentLinkedBy = "CREATED" | "ADMISSION_NO";
export const ACAD_STUDENT_LINKED_BY: readonly AcadStudentLinkedBy[] = ["CREATED", "ADMISSION_NO"];

/**
 * Maps to `acad_student_map` — which Academy student is which ERP student. A separate table rather than a column on
 * `std_student`: that is the busiest table in the system and a deliberately closed core entity, and "this student came
 * from the Academy" is integration knowledge, not student knowledge.
 *
 * `linkedBy` records how the pair was established: `CREATED` (the ERP student was created from the Academy record) or
 * `ADMISSION_NO` (an ERP student that already existed was adopted because the admission numbers matched). The
 * admission number is the financial key (receipts, M-Pesa and bank matching all use it), so it is never rewritten from
 * the Academy afterwards — a later difference is reported, not applied (`academyAdmissionNo` keeps what the Academy said).
 */
@Entity("acad_student_map")
@Index("uq_acad_student_map_student", ["studentId"], { unique: true })
@Index("uq_acad_student_map_academy", ["academyStudentId"], { unique: true })
@Check("ck_acad_student_map_linked_by", `"linked_by" IN ('CREATED','ADMISSION_NO')`)
export class AcadStudentMapEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;

  @Column({ type: "varchar", length: 64, name: "academy_student_id" })
  academyStudentId!: string;

  @Column({ type: "varchar", length: 30, name: "academy_admission_no", nullable: true })
  academyAdmissionNo!: string | null;

  /** What the Academy last said the student's status is (ACTIVE | INACTIVE | ALUMNI). */
  @Column({ type: "varchar", length: 15, name: "academy_status" })
  academyStatus!: string;

  /** SHA-256 of the normalised Academy record last applied — unchanged hash means nothing to do. */
  @Column({ type: "varchar", length: 64, name: "last_hash" })
  lastHash!: string;

  @Column({ type: "timestamptz", name: "last_seen_at" })
  lastSeenAt!: Date;

  /** The Academy has soft-deleted this student. The ERP student is NEVER deleted by sync. */
  @Column({ type: "boolean", name: "removed_in_academy", default: false })
  removedInAcademy!: boolean;

  @Column({ type: "varchar", length: 15, name: "linked_by" })
  linkedBy!: AcadStudentLinkedBy;
}
