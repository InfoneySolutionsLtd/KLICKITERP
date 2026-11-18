import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

export type AcadPaymentRequestStatus = "RECEIVED" | "SENT" | "REFUSED";
export const ACAD_PAYMENT_REQUEST_STATUSES: readonly AcadPaymentRequestStatus[] = ["RECEIVED", "SENT", "REFUSED"];

/**
 * Maps to `acad_payment_request` — one "send this parent an M-Pesa prompt" request from the Academy parent portal.
 *
 * `academyRequestId` is chosen by the Academy and is UNIQUE: it is what makes the call idempotent (a retry — a dropped
 * connection, a double tap — finds the row and never sends a second prompt to the parent's phone).
 *
 * The row is a LINK, not a ledger. The money is the existing M-Pesa flow (`pay_mpesa_transaction` -> callback ->
 * `pay_receipt`); `mpesaTransactionId` points at it, and what the parent is told (waiting / paid / not completed) is read
 * from there every time, never copied here, so it can never disagree with the books.
 *
 * `status`: `RECEIVED` = accepted, prompt not sent yet (or the process stopped before it was); `SENT` = the prompt was
 * sent (`mpesaTransactionId` is set); `REFUSED` = turned down before anything was sent (`refusalCode`/`refusalMessage`
 * say why — recorded so a replay of the same request answers the same).
 */
@Entity("acad_payment_request")
@Index("uq_acad_payment_request_academy", ["academyRequestId"], { unique: true })
@Index("ix_acad_payment_request_student", ["studentId", "createdAt"])
@Check("ck_acad_payment_request_status", `"status" IN ('RECEIVED','SENT','REFUSED')`)
export class AcadPaymentRequestEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "academy_request_id" })
  academyRequestId!: string;

  @Column({ type: "varchar", length: 64, name: "academy_student_id" })
  academyStudentId!: string;

  /** NULL when the Academy named a student this ERP has no link for. */
  @Column({ type: "uuid", name: "student_id", nullable: true })
  studentId!: string | null;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "amount" })
  amount!: string;

  @Column({ type: "varchar", length: 20, name: "msisdn_masked" })
  msisdnMasked!: string;

  @Column({ type: "jsonb", name: "invoice_ids", nullable: true })
  invoiceIds!: string[] | null;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: AcadPaymentRequestStatus;

  @Column({ type: "varchar", length: 30, name: "refusal_code", nullable: true })
  refusalCode!: string | null;

  @Column({ type: "varchar", length: 300, name: "refusal_message", nullable: true })
  refusalMessage!: string | null;

  @Column({ type: "uuid", name: "mpesa_transaction_id", nullable: true })
  mpesaTransactionId!: string | null;
}
