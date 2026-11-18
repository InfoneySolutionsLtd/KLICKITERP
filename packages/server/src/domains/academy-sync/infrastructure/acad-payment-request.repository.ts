import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { generateUuidV7 } from "../../../shared/ids/uuid7";

/** An invoice a parent can pay toward: posted (or part paid) with something still owing. */
export const PAYABLE_INVOICE_STATUSES = ["POSTED", "PARTIALLY_PAID"] as const;

export interface PaymentRequestRow {
  id: string;
  academyRequestId: string;
  academyStudentId: string;
  studentId: string | null;
  /** Decimal string, 4 places. */
  amount: string;
  status: "RECEIVED" | "SENT" | "REFUSED";
  refusalCode: string | null;
  refusalMessage: string | null;
  mpesaTransactionId: string | null;
  invoiceIds: string[] | null;
}

export interface NewPaymentRequest {
  academyRequestId: string;
  academyStudentId: string;
  amount: string;
  msisdnMasked: string;
  invoiceIds: string[] | null;
}

/** Everything the status answer is derived from — the request, the M-Pesa transaction it produced, and its receipt. */
export interface PaymentRequestStatusRow {
  academyRequestId: string;
  amount: string;
  requestStatus: "RECEIVED" | "SENT" | "REFUSED";
  refusalCode: string | null;
  refusalMessage: string | null;
  requestCreatedAt: Date;
  transactionState: string | null;
  transactionUpdatedAt: Date | null;
  receiptNumber: string | null;
}

interface RawRequestRow {
  id: string;
  academy_request_id: string;
  academy_student_id: string;
  student_id: string | null;
  amount: string;
  status: PaymentRequestRow["status"];
  refusal_code: string | null;
  refusal_message: string | null;
  mpesa_transaction_id: string | null;
  invoice_ids: string[] | null;
}

function toRow(raw: RawRequestRow): PaymentRequestRow {
  return {
    id: raw.id,
    academyRequestId: raw.academy_request_id,
    academyStudentId: raw.academy_student_id,
    studentId: raw.student_id,
    amount: raw.amount,
    status: raw.status,
    refusalCode: raw.refusal_code,
    refusalMessage: raw.refusal_message,
    mpesaTransactionId: raw.mpesa_transaction_id,
    invoiceIds: raw.invoice_ids,
  };
}

const COLUMNS = `id, academy_request_id, academy_student_id, student_id, amount::text AS amount, status, refusal_code,
                 refusal_message, mpesa_transaction_id, invoice_ids`;

/**
 * Raw SQL for the Academy payment requests (the precedent set by `AcademyInvoiceSnapshotRepository`): a few narrow reads
 * over billing/student tables plus the module's own `acad_payment_request` writes. It NEVER writes a `bill_*`, `pay_*` or
 * `std_*` table — money moves only through the payments module's own services.
 */
@Injectable()
export class AcadPaymentRequestRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findByAcademyRequestId(academyRequestId: string): Promise<PaymentRequestRow | null> {
    const rows: RawRequestRow[] = await this.dataSource.query(
      `SELECT ${COLUMNS} FROM app.acad_payment_request WHERE academy_request_id = $1`,
      [academyRequestId],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  /**
   * Records the request as `RECEIVED`. `inserted` is false when the Academy's request id was already there — a retry, or
   * two identical calls racing — in which case `row` is the existing one and nothing else may be done for it.
   */
  async insertReceived(input: NewPaymentRequest): Promise<{ inserted: boolean; row: PaymentRequestRow }> {
    const inserted: RawRequestRow[] = await this.dataSource.query(
      `
      INSERT INTO app.acad_payment_request
        (id, academy_request_id, academy_student_id, amount, msisdn_masked, invoice_ids, status)
      VALUES ($1, $2, $3, $4::numeric, $5, $6::jsonb, 'RECEIVED')
      ON CONFLICT (academy_request_id) DO NOTHING
      RETURNING ${COLUMNS}
      `,
      [
        generateUuidV7(),
        input.academyRequestId,
        input.academyStudentId,
        input.amount,
        input.msisdnMasked,
        input.invoiceIds ? JSON.stringify(input.invoiceIds) : null,
      ],
    );
    if (inserted[0]) {
      return { inserted: true, row: toRow(inserted[0]) };
    }
    const existing = await this.findByAcademyRequestId(input.academyRequestId);
    if (!existing) {
      throw new Error("acad_payment_request: conflicting row vanished");
    }
    return { inserted: false, row: existing };
  }

  async markRefused(id: string, code: string, message: string, studentId: string | null): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE app.acad_payment_request
         SET status = 'REFUSED', refusal_code = $2, refusal_message = $3, student_id = COALESCE($4::uuid, student_id),
             updated_at = now(), version = version + 1
       WHERE id = $1 AND status = 'RECEIVED'
      `,
      [id, code, message.slice(0, 300), studentId],
    );
  }

  /** Links the request to the M-Pesa transaction. Runs on the SAME manager as the STK initiation so they commit together. */
  async markSent(id: string, studentId: string, mpesaTransactionId: string, em: EntityManager): Promise<void> {
    await em.query(
      `
      UPDATE app.acad_payment_request
         SET status = 'SENT', student_id = $2::uuid, mpesa_transaction_id = $3::uuid, updated_at = now(), version = version + 1
       WHERE id = $1 AND status = 'RECEIVED'
      `,
      [id, studentId, mpesaTransactionId],
    );
  }

  /** The ERP student (and the admission number M-Pesa will show as the account) behind an Academy student id. */
  async findStudentLink(academyStudentId: string): Promise<{ studentId: string; admissionNo: string } | null> {
    const rows: Array<{ student_id: string; admission_no: string }> = await this.dataSource.query(
      `
      SELECT m.student_id, s.admission_no
        FROM app.acad_student_map m
        JOIN app.std_student s ON s.id = m.student_id
       WHERE m.academy_student_id = $1 AND m.removed_in_academy = false
      `,
      [academyStudentId],
    );
    return rows[0] ? { studentId: rows[0].student_id, admissionNo: rows[0].admission_no } : null;
  }

  /** The student's invoices that can still be paid toward (optionally only the named ones), with what is owing on each. */
  async findPayableInvoices(studentId: string, invoiceIds: string[] | null): Promise<Array<{ id: string; balance: string }>> {
    return this.dataSource.query(
      `
      SELECT id, balance::text AS balance
        FROM app.bill_invoice
       WHERE student_id = $1::uuid
         AND status = ANY($2::text[])
         AND balance > 0
         AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))
       ORDER BY due_date ASC, id ASC
      `,
      [studentId, PAYABLE_INVOICE_STATUSES, invoiceIds],
    );
  }

  /** Is a prompt for this student already out and unanswered (sent within `seconds`, M-Pesa transaction still open)? */
  async hasWaitingPrompt(studentId: string, seconds: number, excludeRequestId: string): Promise<boolean> {
    const rows: Array<{ waiting: boolean }> = await this.dataSource.query(
      `
      SELECT EXISTS (
        SELECT 1
          FROM app.acad_payment_request r
          JOIN app.pay_mpesa_transaction t ON t.id = r.mpesa_transaction_id
         WHERE r.student_id = $1::uuid
           AND r.id <> $2::uuid
           AND r.status = 'SENT'
           AND t.state IN ('INITIATED', 'PENDING')
           AND r.created_at > now() - make_interval(secs => $3::int)
      ) AS waiting
      `,
      [studentId, excludeRequestId, seconds],
    );
    return rows[0]?.waiting === true;
  }

  async findStatusRow(academyRequestId: string): Promise<PaymentRequestStatusRow | null> {
    const rows: Array<{
      academy_request_id: string;
      amount: string;
      request_status: PaymentRequestStatusRow["requestStatus"];
      refusal_code: string | null;
      refusal_message: string | null;
      request_created_at: Date;
      transaction_state: string | null;
      transaction_updated_at: Date | null;
      receipt_number: string | null;
    }> = await this.dataSource.query(
      `
      SELECT r.academy_request_id, r.amount::text AS amount, r.status AS request_status, r.refusal_code, r.refusal_message,
             r.created_at AS request_created_at, t.state AS transaction_state, t.updated_at AS transaction_updated_at,
             rc.number AS receipt_number
        FROM app.acad_payment_request r
        LEFT JOIN app.pay_mpesa_transaction t ON t.id = r.mpesa_transaction_id
        LEFT JOIN app.pay_receipt rc ON rc.id = t.matched_receipt_id
       WHERE r.academy_request_id = $1
      `,
      [academyRequestId],
    );
    const row = rows[0];
    return row
      ? {
          academyRequestId: row.academy_request_id,
          amount: row.amount,
          requestStatus: row.request_status,
          refusalCode: row.refusal_code,
          refusalMessage: row.refusal_message,
          requestCreatedAt: row.request_created_at,
          transactionState: row.transaction_state,
          transactionUpdatedAt: row.transaction_updated_at,
          receiptNumber: row.receipt_number,
        }
      : null;
  }
}
