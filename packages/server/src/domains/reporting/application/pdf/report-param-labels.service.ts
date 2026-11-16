import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { ReportParamType } from "../report-registry.service";
import { formatDate, humanizeKey } from "./report-formatters";

export interface ParamLine {
  label: string;
  value: string;
}

interface IdLookup {
  /** Label printed in front of the resolved value. */
  label: string;
  /** Single-parameter query (`$1` = the id) returning one column, `v`. */
  sql: string;
}

const PERIOD_RANGE = `to_char(p.starts_on, 'DD Mon YYYY') || ' – ' || to_char(p.ends_on, 'DD Mon YYYY')`;

/**
 * The id-typed report parameters, keyed by parameter name (the same key means the same thing in
 * every report that declares it — `studentId` is always a `std_student`). Each lookup resolves to
 * the human-readable value a person would recognise. Raw SQL on purpose: the reporting domain
 * already reads other domains' tables directly in its reports, and importing ~12 other domains'
 * repositories just to print a label would add cross-module dependencies for no gain.
 *
 * Any id that is NOT listed here (e.g. the audit log's generic `entityId`) is simply left off the
 * printed parameter block. A printed report never shows a raw id.
 */
const ID_LOOKUPS: Record<string, IdLookup> = {
  studentId: {
    label: "Student",
    sql: `SELECT first_name || ' ' || last_name || ' (' || admission_no || ')' AS v FROM app.std_student WHERE id = $1`,
  },
  walletId: {
    label: "Wallet",
    sql: `SELECT s.first_name || ' ' || s.last_name || ' (' || s.admission_no || ')' AS v
          FROM app.wall_wallet w JOIN app.std_student s ON s.id = w.student_id WHERE w.id = $1`,
  },
  supplierId: { label: "Supplier", sql: `SELECT name AS v FROM app.proc_supplier WHERE id = $1` },
  bankAccountId: {
    label: "Bank account",
    sql: `SELECT name || COALESCE(' (' || account_no || ')', '') AS v FROM app.bank_account WHERE id = $1`,
  },
  accountId: { label: "Account", sql: `SELECT code || ' — ' || name AS v FROM app.gl_account WHERE id = $1` },
  periodId: { label: "Period", sql: `SELECT ${PERIOD_RANGE} AS v FROM app.gl_period p WHERE p.id = $1` },
  fromPeriodId: { label: "From period", sql: `SELECT ${PERIOD_RANGE} AS v FROM app.gl_period p WHERE p.id = $1` },
  toPeriodId: { label: "To period", sql: `SELECT ${PERIOD_RANGE} AS v FROM app.gl_period p WHERE p.id = $1` },
  termId: {
    label: "Term",
    sql: `SELECT t.name || ' · ' || y.name AS v
          FROM app.set_term t JOIN app.set_academic_year y ON y.id = t.academic_year_id WHERE t.id = $1`,
  },
  academicYearId: { label: "Academic year", sql: `SELECT name AS v FROM app.set_academic_year WHERE id = $1` },
  runId: { label: "Payroll run", sql: `SELECT period_key || ' (' || run_kind || ')' AS v FROM app.pyrl_run WHERE id = $1` },
  routeId: { label: "Transport route", sql: `SELECT name AS v FROM app.bill_transport_route WHERE id = $1` },
  storeId: { label: "Store", sql: `SELECT name AS v FROM app.inv_store WHERE id = $1` },
  categoryId: { label: "Expense category", sql: `SELECT name AS v FROM app.exp_category WHERE id = $1` },
  stockTakeId: { label: "Stock take", sql: `SELECT number AS v FROM app.inv_stock_take WHERE id = $1` },
  depreciationRunId: {
    label: "Depreciation run",
    sql: `SELECT ${PERIOD_RANGE} AS v FROM app.fa_depreciation_run r JOIN app.gl_period p ON p.id = r.period_id WHERE r.id = $1`,
  },
  actorId: { label: "User", sql: `SELECT COALESCE(NULLIF(full_name, ''), email) AS v FROM app.usr_user WHERE id = $1` },
};

/**
 * Turns a report's raw parameters into the readable "Label: value" lines printed under its title.
 * Without this, a student statement's header would say nothing about WHOSE statement it is (its
 * only parameter is a UUID).
 *
 *  - id parameters are resolved through `ID_LOOKUPS`; an unknown id key, an id that no longer
 *    exists, or a failed lookup is omitted (never printed raw, never fails the export);
 *  - date parameters are formatted like the report body ("01 Jul 2026");
 *  - string / number parameters print as given;
 *  - empty values are skipped. Lines follow the report's own parameter order.
 *
 * **Queries run on the `DataSource`, never on the export's transaction.** A failed query (e.g. a
 * malformed id) inside a Postgres transaction aborts the WHOLE transaction — catching the JS error
 * would not save the verification insert and job update that follow. These are plain reads of
 * already-committed rows, so a separate connection is both safe and isolates their failures.
 */
@Injectable()
export class ReportParamLabelsService {
  private readonly logger = new Logger(ReportParamLabelsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async describe(
    paramsShape: Record<string, ReportParamType>,
    params: Record<string, unknown>,
    timeZone?: string,
  ): Promise<ParamLine[]> {
    const lines: ParamLine[] = [];

    for (const [key, type] of Object.entries(paramsShape)) {
      const raw = params[key];
      if (raw === undefined || raw === null || raw === "") continue;

      if (type === "uuid") {
        const lookup = ID_LOOKUPS[key];
        if (!lookup || typeof raw !== "string") continue;
        const value = await this.resolve(lookup, raw);
        if (value) lines.push({ label: lookup.label, value });
        continue;
      }

      const value = type === "date" ? formatDate(raw, timeZone) : String(raw);
      if (value) lines.push({ label: humanizeKey(key), value });
    }
    return lines;
  }

  /** Display name of the person who generated a report ("John Havy"), or null if it can't be resolved. */
  async userDisplayName(userId: string): Promise<string | null> {
    return this.resolve(ID_LOOKUPS.actorId, userId);
  }

  private async resolve(lookup: IdLookup, id: string): Promise<string | null> {
    try {
      const rows = (await this.dataSource.query(lookup.sql, [id])) as { v: string | null }[];
      const value = rows[0]?.v;
      return value ? String(value) : null;
    } catch (error) {
      // e.g. a malformed id: leave the line off rather than fail the whole export.
      this.logger.warn(`Could not resolve report parameter "${lookup.label}": ${(error as Error).message}`);
      return null;
    }
  }
}
