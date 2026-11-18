import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { generateUuidV7 } from "../../../shared/ids/uuid7";

/** The invoice states a parent may see. A draft, an invoice awaiting approval, or an approved-but-unposted one is not yet a bill. */
export const PUBLISHABLE_STATUSES = ["POSTED", "PARTIALLY_PAID", "PAID", "VOID"] as const;

/** Do not retry an invoice the Academy rejected until this long has passed (a rejection does not fix itself in a minute). */
export const REJECTION_BACKOFF_MINUTES = 30;

export interface InvoiceSnapshot {
  erpInvoiceId: string;
  academyStudentId: string;
  number: string;
  /** e.g. `2026 Term 1`. */
  termName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  /** `STRUCTURE`, `ADHOC`, `CARRIED_FORWARD`, ... — lets the portal label a balance brought forward. */
  source: string;
  currency: "KES";
  /** Decimal strings, exactly as the ERP holds them (4 places). */
  total: string;
  paidAmount: string;
  balance: string;
  /** `bill_invoice.version` — the Academy applies a snapshot only if this is newer than what it holds. */
  version: number;
  lines: Array<{ description: string; amount: string; concessionAmount: string }>;
}

interface PendingRow {
  id: string;
  number: string;
  status: string;
  source: string;
  version: number;
  issue_date: string;
  due_date: string;
  total: string;
  paid_amount: string;
  balance: string;
  academy_student_id: string;
  term_name: string;
  year_name: string;
}

/**
 * Read-only SQL over the billing tables for the publisher. Raw SQL rather than the billing module's repositories on
 * purpose (the precedent set by `domains/reporting`): the publisher needs one narrow, joined projection and must not pull
 * billing's services into this module. It never writes to a `bill_*` table.
 *
 * WHICH invoices: only those of students that sync has linked to an Academy student (`acad_student_map`, and not removed
 * there) — an invoice for a student the Academy does not know cannot be shown to anyone. Voided invoices are sent only if
 * the portal has seen them before (to take them off a parent's list), never as new.
 */
@Injectable()
export class AcademyInvoiceSnapshotRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Invoices whose portal copy is missing or behind, oldest change first. */
  async findPending(limit: number, studentId?: string): Promise<InvoiceSnapshot[]> {
    const rows: PendingRow[] = await this.dataSource.query(
      `
      SELECT i.id, i.number, i.status, i.source, i.version,
             to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date,
             to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
             i.total::text AS total, i.paid_amount::text AS paid_amount, i.balance::text AS balance,
             m.academy_student_id, t.name AS term_name, y.name AS year_name
        FROM app.bill_invoice i
        JOIN app.acad_student_map m ON m.student_id = i.student_id AND m.removed_in_academy = false
        JOIN app.set_term t ON t.id = i.term_id
        JOIN app.set_academic_year y ON y.id = t.academic_year_id
        LEFT JOIN app.acad_invoice_publication p ON p.invoice_id = i.id
       WHERE i.status = ANY($1::text[])
         AND (i.status <> 'VOID' OR p.published_version IS NOT NULL)
         AND (p.invoice_id IS NULL OR p.published_version IS NULL OR p.published_version < i.version)
         AND (p.last_error IS NULL OR p.last_attempt_at IS NULL OR p.last_attempt_at < now() - make_interval(mins => $2::int))
         AND ($3::uuid IS NULL OR i.student_id = $3::uuid)
       ORDER BY i.updated_at ASC, i.id ASC
       LIMIT $4
      `,
      [PUBLISHABLE_STATUSES, REJECTION_BACKOFF_MINUTES, studentId ?? null, limit],
    );
    if (rows.length === 0) {
      return [];
    }

    const lineRows: Array<{ invoice_id: string; description: string; amount: string; concession_amount: string }> = await this.dataSource.query(
      `
      SELECT invoice_id, description, amount::text AS amount, concession_amount::text AS concession_amount
        FROM app.bill_invoice_line
       WHERE invoice_id = ANY($1::uuid[])
       ORDER BY invoice_id, line_no
      `,
      [rows.map((row) => row.id)],
    );
    const linesByInvoice = new Map<string, InvoiceSnapshot["lines"]>();
    for (const line of lineRows) {
      const list = linesByInvoice.get(line.invoice_id) ?? [];
      list.push({ description: line.description, amount: line.amount, concessionAmount: line.concession_amount });
      linesByInvoice.set(line.invoice_id, list);
    }

    return rows.map((row) => ({
      erpInvoiceId: row.id,
      academyStudentId: row.academy_student_id,
      number: row.number,
      termName: `${row.year_name} ${row.term_name}`.trim(),
      issueDate: row.issue_date,
      dueDate: row.due_date,
      status: row.status,
      source: row.source,
      currency: "KES",
      total: row.total,
      paidAmount: row.paid_amount,
      balance: row.balance,
      version: row.version,
      lines: linesByInvoice.get(row.id) ?? [],
    }));
  }

  /** How many invoices are waiting to be sent, how many the Academy rejected, and how many are up to date. */
  async counts(): Promise<{ pending: number; rejected: number; published: number }> {
    const [row]: Array<{ pending: string; rejected: string; published: string }> = await this.dataSource.query(
      `
      SELECT count(*) FILTER (WHERE p.invoice_id IS NULL OR p.published_version IS NULL OR p.published_version < i.version) AS pending,
             count(*) FILTER (WHERE p.last_error IS NOT NULL AND (p.published_version IS NULL OR p.published_version < i.version)) AS rejected,
             count(*) FILTER (WHERE p.published_version IS NOT NULL AND p.published_version >= i.version) AS published
        FROM app.bill_invoice i
        JOIN app.acad_student_map m ON m.student_id = i.student_id AND m.removed_in_academy = false
        LEFT JOIN app.acad_invoice_publication p ON p.invoice_id = i.id
       WHERE i.status = ANY($1::text[])
         AND (i.status <> 'VOID' OR p.published_version IS NOT NULL)
      `,
      [PUBLISHABLE_STATUSES],
    );
    return { pending: Number(row.pending), rejected: Number(row.rejected), published: Number(row.published) };
  }

  /** The Academy accepted (or already held) this version. Clears any earlier rejection. */
  async markPublished(invoiceId: string, version: number): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO app.acad_invoice_publication (id, invoice_id, published_version, published_at, attempts, last_attempt_at, last_error)
      VALUES ($3, $1, $2, now(), 0, now(), NULL)
      ON CONFLICT (invoice_id) DO UPDATE
        SET published_version = GREATEST(COALESCE(app.acad_invoice_publication.published_version, 0), EXCLUDED.published_version),
            published_at = now(), attempts = 0, last_attempt_at = now(), last_error = NULL, updated_at = now()
      `,
      [invoiceId, version, generateUuidV7()],
    );
  }

  /** The Academy refused this invoice. Recorded so it is not retried every minute and so an admin can see why. */
  async markRejected(invoiceId: string, reason: string): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO app.acad_invoice_publication (id, invoice_id, published_version, attempts, last_attempt_at, last_error)
      VALUES ($3, $1, NULL, 1, now(), $2)
      ON CONFLICT (invoice_id) DO UPDATE
        SET attempts = app.acad_invoice_publication.attempts + 1, last_attempt_at = now(), last_error = EXCLUDED.last_error, updated_at = now()
      `,
      [invoiceId, reason.slice(0, 300), generateUuidV7()],
    );
  }

  /** A few of the rejections, so the admin sees WHICH invoices and why. */
  async recentRejections(limit: number): Promise<Array<{ invoiceNumber: string; reason: string; at: Date | null }>> {
    const rows: Array<{ number: string; last_error: string; last_attempt_at: Date | null }> = await this.dataSource.query(
      `
      SELECT i.number, p.last_error, p.last_attempt_at
        FROM app.acad_invoice_publication p
        JOIN app.bill_invoice i ON i.id = p.invoice_id
       WHERE p.last_error IS NOT NULL AND (p.published_version IS NULL OR p.published_version < i.version)
       ORDER BY p.last_attempt_at DESC NULLS LAST
       LIMIT $1
      `,
      [limit],
    );
    return rows.map((row) => ({ invoiceNumber: row.number, reason: row.last_error, at: row.last_attempt_at }));
  }
}
