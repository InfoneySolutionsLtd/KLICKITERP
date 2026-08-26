import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface BankAccountStatementParams {
  bankAccountId: string;
  fromDate: string;
  toDate: string;
}

interface RawActivityRow {
  txn_date: string;
  type: string;
  reference: string;
  debit: string;
  credit: string;
}

/**
 * Combined activity for one bank account across `bank_deposit`,
 * `bank_withdrawal`, and both legs of `bank_transfer` — with a running
 * balance, the same one-`UNION ALL`-query-plus-JS-walk shape
 * `supplier-statement.report.ts` established. **Documented gap**: none of
 * these three tables has a real transaction-date column, only inherited
 * `created_at`/`updated_at` — uses `created_at::date` as the proxy, the same
 * class of gap `vehicle-expense.report.ts` documents for `exp_voucher`.
 * Restricted to `status = 'POSTED'` (the only rows with a real GL effect).
 * `bank_transfer` is two-legged (`from_account_id`/`to_account_id` on the
 * SAME row) — modeled as two of the four `UNION ALL` branches below, mutually
 * exclusive by `WHERE`, rather than one branch like deposit/withdrawal.
 * Per `supplier-statement.report.ts`'s own documented scope choice, the
 * running balance starts at 0 for the selected window, not a true
 * from-account-inception opening balance.
 */
@Injectable()
export class BankAccountStatementReport implements ReportDefinition<BankAccountStatementParams> {
  readonly code = "bank-account-statement";
  readonly name = "Bank Account Statement";
  readonly domain = "banking";
  readonly permissionCode = "reports:bank-account-statement:view";
  readonly paramsShape = { bankAccountId: "uuid", fromDate: "date", toDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "transactionDate", label: "Date", type: "date" },
    { key: "type", label: "Type", type: "string" },
    { key: "reference", label: "Reference", type: "string" },
    { key: "debit", label: "Debit", type: "money" },
    { key: "credit", label: "Credit", type: "money" },
    { key: "runningBalance", label: "Balance", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: BankAccountStatementParams): Promise<ReportResult> {
    const rawRows: RawActivityRow[] = await this.dataSource.query(
      `(
         SELECT d.created_at::date::text AS txn_date, 'DEPOSIT' AS type, d.number AS reference,
                '0'::text AS debit, d.amount::text AS credit
         FROM app.bank_deposit d
         WHERE d.account_id = $1 AND d.status = 'POSTED' AND d.created_at::date >= $2 AND d.created_at::date <= $3
       )
       UNION ALL
       (
         SELECT w.created_at::date::text, 'WITHDRAWAL', w.number,
                w.amount::text, '0'::text
         FROM app.bank_withdrawal w
         WHERE w.account_id = $1 AND w.status = 'POSTED' AND w.created_at::date >= $2 AND w.created_at::date <= $3
       )
       UNION ALL
       (
         SELECT t.created_at::date::text, 'TRANSFER_OUT', t.number,
                t.amount::text, '0'::text
         FROM app.bank_transfer t
         WHERE t.from_account_id = $1 AND t.status = 'POSTED' AND t.created_at::date >= $2 AND t.created_at::date <= $3
       )
       UNION ALL
       (
         SELECT t.created_at::date::text, 'TRANSFER_IN', t.number,
                '0'::text, t.amount::text
         FROM app.bank_transfer t
         WHERE t.to_account_id = $1 AND t.status = 'POSTED' AND t.created_at::date >= $2 AND t.created_at::date <= $3
       )
       ORDER BY txn_date ASC, reference ASC`,
      [params.bankAccountId, params.fromDate, params.toDate],
    );

    let runningBalance = Money.ZERO;
    let totalDebit = Money.ZERO;
    let totalCredit = Money.ZERO;
    const rows = rawRows.map((row) => {
      const debit = Money.fromDecimalString(row.debit);
      const credit = Money.fromDecimalString(row.credit);
      runningBalance = runningBalance.add(credit).subtract(debit);
      totalDebit = totalDebit.add(debit);
      totalCredit = totalCredit.add(credit);
      return {
        transactionDate: row.txn_date,
        type: row.type,
        reference: row.reference,
        debit,
        credit,
        runningBalance,
      };
    });

    return {
      rows,
      totals: { totalDebit, totalCredit, closingBalance: runningBalance },
      generatedAt: new Date(),
    };
  }
}
