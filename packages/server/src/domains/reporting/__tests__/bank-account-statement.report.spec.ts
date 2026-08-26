import { DataSource } from "typeorm";
import { BankAccountStatementReport } from "../application/bank-account-statement.report";
import { Money } from "../../../shared/money/money";

describe("BankAccountStatementReport", () => {
  let dataSource: { query: jest.Mock };
  let report: BankAccountStatementReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new BankAccountStatementReport(dataSource as unknown as DataSource);
  });

  it("walks a running balance across deposits, withdrawals, and both transfer legs", async () => {
    dataSource.query.mockResolvedValue([
      { txn_date: "2026-02-01", type: "DEPOSIT", reference: "DEP-0001", debit: "0", credit: "1000.0000" },
      { txn_date: "2026-02-02", type: "WITHDRAWAL", reference: "WD-0001", debit: "200.0000", credit: "0" },
      { txn_date: "2026-02-03", type: "TRANSFER_OUT", reference: "TRF-0001", debit: "300.0000", credit: "0" },
      { txn_date: "2026-02-04", type: "TRANSFER_IN", reference: "TRF-0002", debit: "0", credit: "150.0000" },
    ]);

    const result = await report.execute({ bankAccountId: "acct-1", fromDate: "2026-02-01", toDate: "2026-02-28" });

    expect(result.rows).toHaveLength(4);
    const lastRow = result.rows[3] as { runningBalance: Money };
    expect(lastRow.runningBalance.toDecimalString()).toBe("650.0000");

    const totals = result.totals as { totalDebit: Money; totalCredit: Money; closingBalance: Money };
    expect(totals.totalDebit.toDecimalString()).toBe("500.0000");
    expect(totals.totalCredit.toDecimalString()).toBe("1150.0000");
    expect(totals.closingBalance.toDecimalString()).toBe("650.0000");

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("t.from_account_id = $1");
    expect(sql).toContain("t.to_account_id = $1");
    expect(sql).toContain("status = 'POSTED'");
    expect(params).toEqual(["acct-1", "2026-02-01", "2026-02-28"]);
  });
});
