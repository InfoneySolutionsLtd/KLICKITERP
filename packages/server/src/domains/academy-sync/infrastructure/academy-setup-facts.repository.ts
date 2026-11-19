import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

export interface FeeOptionFacts {
  /** There is a current academic year with at least one term that has not ended (what a parent can be invoiced for). */
  hasOpenTerm: boolean;
  /** Optional fee lines on the current year's PUBLISHED fee structures. */
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
    const rows: Array<{ has_open_term: boolean; optional_lines: number; active_routes: number }> = await this.dataSource.query(`
      WITH cur AS (SELECT id FROM app.set_academic_year WHERE is_current LIMIT 1)
      SELECT
        EXISTS (
          SELECT 1 FROM app.set_term t JOIN cur ON cur.id = t.academic_year_id WHERE t.ends_on >= current_date
        ) AS has_open_term,
        (
          SELECT count(*)::int
            FROM app.bill_fee_structure_line l
            JOIN app.bill_fee_structure s ON s.id = l.fee_structure_id
            JOIN cur ON cur.id = s.academic_year_id
           WHERE s.status = 'PUBLISHED' AND l.is_optional
        ) AS optional_lines,
        (SELECT count(*)::int FROM app.bill_transport_route WHERE is_active) AS active_routes
    `);
    const row = rows[0];
    return { hasOpenTerm: row?.has_open_term === true, optionalItemLines: row?.optional_lines ?? 0, activeRoutes: row?.active_routes ?? 0 };
  }
}
