import { DataSource } from "typeorm";
import { BankReconciliationSummaryReport } from "../application/bank-reconciliation-summary.report";
import { Money } from "../../../shared/money/money";

describe("BankReconciliationSummaryReport", () => {
  let dataSource: { query: jest.Mock };
  let report: BankReconciliationSummaryReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new BankReconciliationSummaryReport(dataSource as unknown as DataSource);
  });

  it("self-computes matched/unmatched breakdown and a book/bank difference", async () => {
    dataSource.query
      .mockResolvedValueOnce([
        { id: "recon-1", status: "IN_PROGRESS", book_balance: "10000.0000", bank_balance: "9800.0000", locked_at: null, starts_on: "2026-02-01", ends_on: "2026-02-28" },
      ])
      .mockResolvedValueOnce([{ cnt: "3", total: "9500.0000" }])
      .mockResolvedValueOnce([{ cnt: "1", total: "200.0000" }]);

    const result = await report.execute({ bankAccountId: "acct-1", periodId: "period-1" });

    expect(result.rows).toEqual([
      { category: "Matched", count: 3, value: expect.any(Money) },
      { category: "Unmatched", count: 1, value: expect.any(Money) },
    ]);
    expect((result.rows[0] as { value: Money }).value.toDecimalString()).toBe("9500.0000");
    expect((result.rows[1] as { value: Money }).value.toDecimalString()).toBe("200.0000");

    const totals = result.totals as { status: string; bookBalance: Money; bankBalance: Money; difference: Money };
    expect(totals.status).toBe("IN_PROGRESS");
    expect(totals.difference.toDecimalString()).toBe("200.0000");

    const [reconSql, reconParams] = dataSource.query.mock.calls[0];
    expect(reconSql).toContain("r.account_id = $1 AND r.period_id = $2");
    expect(reconParams).toEqual(["acct-1", "period-1"]);

    const [matchedSql, matchedParams] = dataSource.query.mock.calls[1];
    expect(matchedSql).toContain("m.reconciliation_id = $1");
    expect(matchedParams).toEqual(["recon-1"]);
  });

  it("throws NotFoundException when no reconciliation exists for the account/period pair", async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await expect(report.execute({ bankAccountId: "acct-1", periodId: "period-1" })).rejects.toThrow(
      "BankReconciliation not found: acct-1/period-1",
    );
  });
});
