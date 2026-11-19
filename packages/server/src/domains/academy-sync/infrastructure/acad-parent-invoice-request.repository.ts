import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import type { AcadParentInvoiceMode, AcadParentInvoiceRequestStatus, ParentInvoiceSelection } from "../domain/acad-parent-invoice-request.entity";

export interface ParentInvoiceRequestRow {
  id: string;
  academyRequestId: string;
  academyStudentId: string;
  studentId: string | null;
  termId: string | null;
  parentName: string | null;
  selection: ParentInvoiceSelection;
  mode: AcadParentInvoiceMode | null;
  status: AcadParentInvoiceRequestStatus;
  refusalCode: string | null;
  refusalMessage: string | null;
  feeInvoiceId: string | null;
  transportInvoiceId: string | null;
}

export interface NewParentInvoiceRequest {
  academyRequestId: string;
  academyStudentId: string;
  termId: string;
  parentName: string | null;
  selection: ParentInvoiceSelection;
}

/** An invoice as the parent and the notification see it. `total` is a decimal string with 4 places, AFTER any concession. */
export interface InvoiceBrief {
  id: string;
  number: string;
  total: string;
  dueDate: string;
}

/** The ERP learner behind an Academy student id. */
export interface LinkedStudent {
  studentId: string;
  admissionNo: string;
  fullName: string;
  status: string;
}

interface RawRequestRow {
  id: string;
  academy_request_id: string;
  academy_student_id: string;
  student_id: string | null;
  term_id: string | null;
  parent_name: string | null;
  selection: ParentInvoiceSelection;
  mode: AcadParentInvoiceMode | null;
  status: AcadParentInvoiceRequestStatus;
  refusal_code: string | null;
  refusal_message: string | null;
  fee_invoice_id: string | null;
  transport_invoice_id: string | null;
}

const COLUMNS = `id, academy_request_id, academy_student_id, student_id, term_id, parent_name, selection, mode, status,
                 refusal_code, refusal_message, fee_invoice_id, transport_invoice_id`;

function toRow(raw: RawRequestRow): ParentInvoiceRequestRow {
  return {
    id: raw.id,
    academyRequestId: raw.academy_request_id,
    academyStudentId: raw.academy_student_id,
    studentId: raw.student_id,
    termId: raw.term_id,
    parentName: raw.parent_name,
    selection: raw.selection,
    mode: raw.mode,
    status: raw.status,
    refusalCode: raw.refusal_code,
    refusalMessage: raw.refusal_message,
    feeInvoiceId: raw.fee_invoice_id,
    transportInvoiceId: raw.transport_invoice_id,
  };
}

/**
 * Raw SQL for the parent-generated invoices (the precedent set by `AcadPaymentRequestRepository`): a few narrow reads over
 * billing/student/user tables plus the module's own `acad_parent_invoice_request` writes. It NEVER writes a `bill_*`,
 * `std_*` or `usr_*` table — invoices are made only through the billing module's own services.
 */
@Injectable()
export class AcadParentInvoiceRequestRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findByAcademyRequestId(academyRequestId: string): Promise<ParentInvoiceRequestRow | null> {
    const rows: RawRequestRow[] = await this.dataSource.query(
      `SELECT ${COLUMNS} FROM app.acad_parent_invoice_request WHERE academy_request_id = $1`,
      [academyRequestId],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  /**
   * Records the request as `RECEIVED`. `inserted` is false when the Academy's request id was already there — a retry, or
   * two identical calls racing — in which case `row` is the existing one and nothing else may be done for it.
   */
  async insertReceived(input: NewParentInvoiceRequest): Promise<{ inserted: boolean; row: ParentInvoiceRequestRow }> {
    const inserted: RawRequestRow[] = await this.dataSource.query(
      `
      INSERT INTO app.acad_parent_invoice_request
        (id, academy_request_id, academy_student_id, term_id, parent_name, selection, status)
      VALUES ($1, $2, $3, $4::uuid, $5, $6::jsonb, 'RECEIVED')
      ON CONFLICT (academy_request_id) DO NOTHING
      RETURNING ${COLUMNS}
      `,
      [
        generateUuidV7(),
        input.academyRequestId,
        input.academyStudentId,
        input.termId,
        input.parentName,
        JSON.stringify(input.selection),
      ],
    );
    if (inserted[0]) {
      return { inserted: true, row: toRow(inserted[0]) };
    }
    const existing = await this.findByAcademyRequestId(input.academyRequestId);
    if (!existing) {
      throw new Error("acad_parent_invoice_request: conflicting row vanished");
    }
    return { inserted: false, row: existing };
  }

  async markRefused(id: string, code: string, message: string, studentId: string | null): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE app.acad_parent_invoice_request
         SET status = 'REFUSED', refusal_code = $2, refusal_message = $3, student_id = COALESCE($4::uuid, student_id),
             updated_at = now(), version = version + 1
       WHERE id = $1 AND status = 'RECEIVED'
      `,
      [id, code, message.slice(0, 300), studentId],
    );
  }

  /** Marks the request created. Runs on the SAME manager as the invoice creation so the two commit (or roll back) together. */
  async markCreated(
    id: string,
    result: { studentId: string; mode: AcadParentInvoiceMode; feeInvoiceId: string | null; transportInvoiceId: string | null },
    em: EntityManager,
  ): Promise<void> {
    await em.query(
      `
      UPDATE app.acad_parent_invoice_request
         SET status = 'CREATED', student_id = $2::uuid, mode = $3, fee_invoice_id = $4::uuid, transport_invoice_id = $5::uuid,
             updated_at = now(), version = version + 1
       WHERE id = $1 AND status = 'RECEIVED'
      `,
      [id, result.studentId, result.mode, result.feeInvoiceId, result.transportInvoiceId],
    );
  }

  /** The ERP learner (and what to call them) behind an Academy student id; null when this ERP has not linked it. */
  async findLinkedStudent(academyStudentId: string): Promise<LinkedStudent | null> {
    const rows: Array<{ student_id: string; admission_no: string; full_name: string; status: string }> = await this.dataSource.query(
      `
      SELECT m.student_id, s.admission_no, btrim(s.first_name || ' ' || s.last_name) AS full_name, s.status
        FROM app.acad_student_map m
        JOIN app.std_student s ON s.id = m.student_id
       WHERE m.academy_student_id = $1 AND m.removed_in_academy = false
      `,
      [academyStudentId],
    );
    const row = rows[0];
    return row ? { studentId: row.student_id, admissionNo: row.admission_no, fullName: row.full_name, status: row.status } : null;
  }

  /**
   * Does the learner already have a live (not voided) STRUCTURE-generated invoice for the term? Only one can exist
   * (BR-BILL-04), and it already carries every mandatory line, so the parent can only top it up.
   */
  async hasLiveStructureInvoice(studentId: string, termId: string, em?: EntityManager): Promise<boolean> {
    const rows: Array<{ found: boolean }> = await (em ?? this.dataSource).query(
      `
      SELECT EXISTS (
        SELECT 1 FROM app.bill_invoice
         WHERE student_id = $1::uuid AND term_id = $2::uuid AND source = 'STRUCTURE' AND status <> 'VOID'
      ) AS found
      `,
      [studentId, termId],
    );
    return rows[0]?.found === true;
  }

  /** Is the learner already billed for transport (any route) on a live invoice of the term? */
  async hasTransportBilled(studentId: string, termId: string): Promise<boolean> {
    const rows: Array<{ found: boolean }> = await this.dataSource.query(
      `
      SELECT EXISTS (
        SELECT 1
          FROM app.bill_transport_billing_line btl
          JOIN app.bill_invoice_line l ON l.id = btl.invoice_line_id
          JOIN app.bill_invoice i ON i.id = l.invoice_id
         WHERE btl.student_id = $1::uuid AND i.term_id = $2::uuid AND i.status <> 'VOID'
      ) AS found
      `,
      [studentId, termId],
    );
    return rows[0]?.found === true;
  }

  /** A user's name and status (the id the school configured to record parent-generated invoices under); null when there is no such user. */
  async findUserBrief(userId: string): Promise<{ id: string; fullName: string; status: string } | null> {
    // A value that is not a UUID (a hand-typed setting) is simply "no such user", not a database error.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
    const rows: Array<{ id: string; full_name: string; status: string }> = await this.dataSource.query(
      `SELECT id, full_name, status FROM app.usr_user WHERE id = $1::uuid`,
      [userId],
    );
    return rows[0] ? { id: rows[0].id, fullName: rows[0].full_name, status: rows[0].status } : null;
  }

  /** Which of these role ids exist (so a typo or a deleted role cannot be saved as a notification target). */
  async existingRoleIds(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const rows: Array<{ id: string }> = await this.dataSource.query(`SELECT id FROM app.usr_role WHERE id = ANY($1::uuid[])`, [roleIds]);
    return rows.map((row) => row.id);
  }

  /** The invoices as posted (so `total` is already net of any concession), in the order asked for. */
  async findInvoiceBriefs(invoiceIds: string[], em?: EntityManager): Promise<InvoiceBrief[]> {
    if (invoiceIds.length === 0) return [];
    const rows: Array<{ id: string; number: string; total: string; due_date: string }> = await (em ?? this.dataSource).query(
      `SELECT id, number, total::text AS total, due_date::text AS due_date FROM app.bill_invoice WHERE id = ANY($1::uuid[])`,
      [invoiceIds],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return invoiceIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [{ id: row.id, number: row.number, total: row.total, dueDate: row.due_date }] : [];
    });
  }

  /** Active users holding any of the given roles (de-duplicated). */
  async activeUserIdsInRoles(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const rows: Array<{ user_id: string }> = await this.dataSource.query(
      `
      SELECT DISTINCT ur.user_id
        FROM app.usr_user_role ur
        JOIN app.usr_user u ON u.id = ur.user_id
       WHERE ur.role_id = ANY($1::uuid[]) AND u.status = 'ACTIVE'
      `,
      [roleIds],
    );
    return rows.map((row) => row.user_id);
  }

  /** Active users whose roles carry a permission (de-duplicated) — the fallback when no notification role was chosen. */
  async activeUserIdsWithPermission(permissionCode: string): Promise<string[]> {
    const rows: Array<{ user_id: string }> = await this.dataSource.query(
      `
      SELECT DISTINCT ur.user_id
        FROM app.usr_user_role ur
        JOIN app.usr_user u ON u.id = ur.user_id
        JOIN app.usr_role_permission rp ON rp.role_id = ur.role_id
        JOIN app.usr_permission p ON p.id = rp.permission_id
       WHERE p.code = $1 AND u.status = 'ACTIVE'
      `,
      [permissionCode],
    );
    return rows.map((row) => row.user_id);
  }
}
