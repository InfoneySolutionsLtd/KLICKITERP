import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface BankReconciliationSummaryParams {
  bankAccountId: string;
  periodId: string;
}

interface RawReconciliationRow {
  id: string;
  status: string;
  book_balance: string;
  bank_balance: string;
  locked_at: string | null;
  starts_on: string;
  ends_on: string;
}

interface RawBreakdownRow {
  cnt: string;
  total: string | null;
}

/**
 * Matched/unmatched breakdown for one `bank_reconciliation` (identified by
 * its real UNIQUE `(account_id, period_id)` pair). `bank_reconciliation`
 * only stores the final `book_balance`/`bank_balance`/`outstanding` (an
 * opaque jsonb blob) — it does NOT store matched/unmatched counts, so this
 * report self-computes them: matched = `bank_recon_match` rows scoped to
 * this reconciliation (joined to `bank_statement_line` for the amount);
 * unmatched = `bank_statement_line` rows for this account, within the
 * period's own date range (`starts_on`..`ends_on`, since an unmatched line
 * has no `reconciliation_id` link at all), with `recon_state = 'UNMATCHED'`.
 * "Value" for both buckets is `SUM(debit + credit)` — the gross value of
 * lines in that bucket, a defensible simple metric for a summary report, not
 * a signed net.
 */
@Injectable()
export class BankReconciliationSummaryReport implements ReportDefinition<BankReconciliationSummaryParams> {
  readonly code = "bank-reconciliation-summary";
  readonly name = "Reconciliation Summary";
  readonly domain = "banking";
  readonly permissionCode = "reports:bank-reconciliation-summary:view";
  readonly paramsShape = { bankAccountId: "uuid", periodId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "category", label: "Category", type: "string" },
    { key: "count", label: "Count", type: "number" },
    { key: "value", label: "Value", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: BankReconciliationSummaryParams): Promise<ReportResult> {
    const reconciliationRows: RawReconciliationRow[] = await this.dataSource.query(
      `SELECT r.id, r.status, r.book_balance, r.bank_balance, r.locked_at::text, p.starts_on::text, p.ends_on::text
       FROM app.bank_reconciliation r
       JOIN app.gl_period p ON p.id = r.period_id
       WHERE r.account_id = $1 AND r.period_id = $2`,
      [params.bankAccountId, params.periodId],
    );
    const reconciliation = reconciliationRows[0];
    if (!reconciliation) {
      throw new NotFoundException("BankReconciliation", `${params.bankAccountId}/${params.periodId}`);
    }

    const [matchedRows, unmatchedRows]: [RawBreakdownRow[], RawBreakdownRow[]] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*)::text AS cnt, SUM(sl.debit + sl.credit)::text AS total
         FROM app.bank_recon_match m
         JOIN app.bank_statement_line sl ON sl.id = m.statement_line_id
         WHERE m.reconciliation_id = $1`,
        [reconciliation.id],
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::text AS cnt, SUM(sl.debit + sl.credit)::text AS total
         FROM app.bank_statement_line sl
         WHERE sl.account_id = $1 AND sl.recon_state = 'UNMATCHED'
           AND sl.line_date >= $2 AND sl.line_date <= $3`,
        [params.bankAccountId, reconciliation.starts_on, reconciliation.ends_on],
      ),
    ]);

    const matchedValue = matchedRows[0]?.total ? Money.fromDecimalString(matchedRows[0].total) : Money.ZERO;
    const unmatchedValue = unmatchedRows[0]?.total ? Money.fromDecimalString(unmatchedRows[0].total) : Money.ZERO;
    const bookBalance = Money.fromDecimalString(reconciliation.book_balance);
    const bankBalance = Money.fromDecimalString(reconciliation.bank_balance);

    return {
      rows: [
        { category: "Matched", count: Number(matchedRows[0]?.cnt ?? 0), value: matchedValue },
        { category: "Unmatched", count: Number(unmatchedRows[0]?.cnt ?? 0), value: unmatchedValue },
      ],
      totals: {
        status: reconciliation.status,
        bookBalance,
        bankBalance,
        difference: bookBalance.subtract(bankBalance),
        lockedAt: reconciliation.locked_at,
      },
      generatedAt: new Date(),
    };
  }
}
