import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

export interface ReceiptHeadRow {
  id: string;
  number: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Decimal string, 4 places. */
  amount: string;
  status: "POSTED" | "REVERSED";
}

export interface ReceiptSplitRow {
  receiptId: string;
  method: string;
  externalRef: string | null;
}

export interface ReceiptAllocationRow {
  receiptId: string;
  amount: string;
  toPrepayment: boolean;
  invoiceNumber: string | null;
}

/** The most receipts one answer carries. */
export const MAX_RECEIPTS_PER_ANSWER = 100;

/**
 * Read-only SQL over the receipt tables for the Academy parent portal (the precedent set by `AcademyInvoiceSnapshotRepository`
 * and `AcadPaymentRequestRepository`). It NEVER writes anything.
 *
 * Every question starts from the ERP learner behind an Academy student id (`acad_student_map`, and not removed there): a
 * receipt is only ever found THROUGH its learner, so an answer about one learner can never include another's receipts, and a
 * receipt id on its own opens nothing. A reversal's contra-receipt (`reversal_of_id` set) is not a document to hand anyone and
 * is never listed or printed; the ORIGINAL receipt that was reversed is, marked as reversed.
 */
@Injectable()
export class AcademyReceiptRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** The address this ERP registered with the Academy (its public API address), or null when it has not registered. */
  async registeredBaseUrl(): Promise<string | null> {
    const rows: Array<{ registered_base_url: string }> = await this.dataSource.query(
      `SELECT registered_base_url FROM app.acad_inbound_link ORDER BY created_at DESC LIMIT 1`,
    );
    return rows[0]?.registered_base_url ?? null;
  }

  /** Is this Academy student one the ERP has linked (and not removed in the Academy)? */
  async isLinked(academyStudentId: string): Promise<boolean> {
    const rows: Array<{ ok: boolean }> = await this.dataSource.query(
      `SELECT true AS ok FROM app.acad_student_map WHERE academy_student_id = $1 AND removed_in_academy = false`,
      [academyStudentId],
    );
    return rows.length > 0;
  }

  /** The learner's receipts, newest first. */
  async findForStudent(academyStudentId: string, limit: number): Promise<ReceiptHeadRow[]> {
    const rows: Array<{ id: string; number: string; date: string; amount: string; status: ReceiptHeadRow["status"] }> = await this.dataSource.query(
      `
      SELECT r.id, r.number, to_char(r.receipt_date, 'YYYY-MM-DD') AS date, r.total::text AS amount, r.status
        FROM app.pay_receipt r
        JOIN app.acad_student_map m ON m.student_id = r.student_id AND m.removed_in_academy = false
       WHERE m.academy_student_id = $1
         AND r.reversal_of_id IS NULL
       ORDER BY r.receipt_date DESC, r.created_at DESC, r.id DESC
       LIMIT $2
      `,
      [academyStudentId, Math.min(Math.max(1, Math.trunc(limit)), MAX_RECEIPTS_PER_ANSWER)],
    );
    return rows;
  }

  /** Does this receipt belong to this Academy student (and is it a real receipt, not a reversal's contra)? */
  async belongsTo(academyStudentId: string, receiptId: string): Promise<boolean> {
    const rows: Array<{ ok: boolean }> = await this.dataSource.query(
      `
      SELECT true AS ok
        FROM app.pay_receipt r
        JOIN app.acad_student_map m ON m.student_id = r.student_id AND m.removed_in_academy = false
       WHERE r.id = $2::uuid
         AND m.academy_student_id = $1
         AND r.reversal_of_id IS NULL
      `,
      [academyStudentId, receiptId],
    );
    return rows.length > 0;
  }

  async findSplits(receiptIds: string[]): Promise<ReceiptSplitRow[]> {
    if (receiptIds.length === 0) return [];
    const rows: Array<{ receipt_id: string; method: string; external_ref: string | null }> = await this.dataSource.query(
      `SELECT receipt_id, method, external_ref FROM app.pay_receipt_split WHERE receipt_id = ANY($1::uuid[]) ORDER BY receipt_id, id`,
      [receiptIds],
    );
    return rows.map((row) => ({ receiptId: row.receipt_id, method: row.method, externalRef: row.external_ref }));
  }

  async findAllocations(receiptIds: string[]): Promise<ReceiptAllocationRow[]> {
    if (receiptIds.length === 0) return [];
    const rows: Array<{ receipt_id: string; amount: string; to_prepayment: boolean; invoice_number: string | null }> = await this.dataSource.query(
      `
      SELECT a.receipt_id, a.amount::text AS amount, a.to_prepayment, i.number AS invoice_number
        FROM app.pay_receipt_allocation a
        LEFT JOIN app.bill_invoice i ON i.id = a.invoice_id
       WHERE a.receipt_id = ANY($1::uuid[])
       ORDER BY a.receipt_id, a.id
      `,
      [receiptIds],
    );
    return rows.map((row) => ({ receiptId: row.receipt_id, amount: row.amount, toPrepayment: row.to_prepayment, invoiceNumber: row.invoice_number }));
  }
}
