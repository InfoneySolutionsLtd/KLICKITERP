import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type AcadParentInvoiceRequestStatus = "RECEIVED" | "CREATED" | "REFUSED";
export type AcadParentInvoiceMode = "FULL" | "TOP_UP";

/** What the parent chose, exactly as recorded: only ids — never an amount, which always comes from the school's own fee structure. */
export interface ParentInvoiceSelection {
  optionalCategoryIds: string[];
  routeId: string | null;
}

/**
 * Maps to `acad_parent_invoice_request` — one "generate this invoice" request from the Academy parent portal, where a
 * parent picked optional fee items and/or a transport route for their own learner.
 *
 * `academyRequestId` is chosen by the Academy and is UNIQUE: it is what makes the call idempotent (a retry — a dropped
 * connection, a double tap — finds the row and never creates a second invoice).
 *
 * The row is a LINK and an audit trail, not a ledger. The invoices are ordinary `bill_invoice` rows made by the billing
 * engine; `feeInvoiceId` / `transportInvoiceId` point at them. `mode`: `FULL` = no fee invoice existed for the term, so the
 * parent's invoice is the term's whole fee invoice; `TOP_UP` = the school had already billed that term, so the parent only
 * added optional items and/or transport.
 *
 * `status`: `RECEIVED` = accepted, invoices not created yet (or the process stopped before they were); `CREATED` = the
 * invoice(s) were created and posted; `REFUSED` = turned down, nothing created (`refusalCode`/`refusalMessage` say why —
 * recorded so a replay of the same request answers the same).
 */
@Entity("acad_parent_invoice_request")
@Index("uq_acad_parent_invoice_request_academy", ["academyRequestId"], { unique: true })
@Index("ix_acad_parent_invoice_request_student", ["studentId", "createdAt"])
@Check("ck_acad_parent_invoice_request_status", `"status" IN ('RECEIVED','CREATED','REFUSED')`)
@Check("ck_acad_parent_invoice_request_mode", `"mode" IS NULL OR "mode" IN ('FULL','TOP_UP')`)
export class AcadParentInvoiceRequestEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "academy_request_id" })
  academyRequestId!: string;

  @Column({ type: "varchar", length: 64, name: "academy_student_id" })
  academyStudentId!: string;

  /** NULL when the Academy named a student this ERP has no link for. */
  @Column({ type: "uuid", name: "student_id", nullable: true })
  studentId!: string | null;

  /** The term the Academy asked for — recorded as asked, even when it is unknown (no foreign key, so a bad one can still be refused and replayed). */
  @Column({ type: "uuid", name: "term_id", nullable: true })
  termId!: string | null;

  /** The parent's name as the Academy verified it — shown to accounts staff in the notification. */
  @Column({ type: "varchar", length: 200, name: "parent_name", nullable: true })
  parentName!: string | null;

  @Column({ type: "jsonb", name: "selection" })
  selection!: ParentInvoiceSelection;

  @Column({ type: "varchar", length: 8, name: "mode", nullable: true })
  mode!: AcadParentInvoiceMode | null;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: AcadParentInvoiceRequestStatus;

  @Column({ type: "varchar", length: 30, name: "refusal_code", nullable: true })
  refusalCode!: string | null;

  @Column({ type: "varchar", length: 300, name: "refusal_message", nullable: true })
  refusalMessage!: string | null;

  @Column({ type: "uuid", name: "fee_invoice_id", nullable: true })
  feeInvoiceId!: string | null;

  @Column({ type: "uuid", name: "transport_invoice_id", nullable: true })
  transportInvoiceId!: string | null;
}
