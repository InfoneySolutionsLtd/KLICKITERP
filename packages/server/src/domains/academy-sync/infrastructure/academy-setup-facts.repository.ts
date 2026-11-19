import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

export interface FeeOptionFacts {
  /** The Academic calendar has a current academic year AND a term marked current inside it: the one term a parent can be invoiced for. */
  hasCurrentTerm: boolean;
  /** Optional fee lines, on the current year's PUBLISHED fee structures, for the current term (the only term a parent can choose from). */
  optionalItemLines: number;
  /** Transport routes that are active. */
  activeRoutes: number;
}

/**
 * Read-only SQL for the setup guide: a few facts that live in tables this module does not own (the academic calendar, fee
 * structures, transport routes). It NEVER writes anything — the precedent set by `AcadParentInvoiceRequestRepository`.
 */
@Injectable()
export class AcademySetupFactsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async feeOptionFacts(): Promise<FeeOptionFacts> {
    const rows: Array<{ has_current_term: boolean; optional_lines: number; active_routes: number }> = await this.dataSource.query(`
      WITH cur AS (SELECT id FROM app.set_academic_year WHERE is_current LIMIT 1)
      SELECT
        EXISTS (
          SELECT 1 FROM app.set_term t JOIN cur ON cur.id = t.academic_year_id WHERE t.is_current
        ) AS has_current_term,
        (
          SELECT count(*)::int
            FROM app.bill_fee_structure_line l
            JOIN app.bill_fee_structure s ON s.id = l.fee_structure_id
            JOIN cur ON cur.id = s.academic_year_id
            JOIN app.set_term ct ON ct.id = l.term_id AND ct.is_current AND ct.academic_year_id = cur.id
           WHERE s.status = 'PUBLISHED' AND l.is_optional
        ) AS optional_lines,
        (SELECT count(*)::int FROM app.bill_transport_route WHERE is_active) AS active_routes
    `);
    const row = rows[0];
    return { hasCurrentTerm: row?.has_current_term === true, optionalItemLines: row?.optional_lines ?? 0, activeRoutes: row?.active_routes ?? 0 };
  }
}
