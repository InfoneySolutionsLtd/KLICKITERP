import { DataSource } from "typeorm";
import { TermWiseBalanceReport } from "../application/term-wise-balance.report";
import { Money } from "../../../shared/money/money";

describe("TermWiseBalanceReport", () => {
  let dataSource: { query: jest.Mock };
  let report: TermWiseBalanceReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new TermWiseBalanceReport(dataSource as unknown as DataSource);
  });

  it("groups invoice totals by term with grand totals", async () => {
    dataSource.query.mockResolvedValue([
      {
        term_id: "term-1",
        term_name: "Term 1",
        student_count: "20",
        invoice_count: "20",
        total_invoiced: "200000.0000",
        total_paid: "150000.0000",
        total_balance: "50000.0000",
      },
      {
        term_id: "term-2",
        term_name: "Term 2",
        student_count: "20",
        invoice_count: "20",
        total_invoiced: "200000.0000",
        total_paid: "100000.0000",
        total_balance: "100000.0000",
      },
    ]);

    const result = await report.execute({ academicYearId: "year-1" });

    expect(result.rows).toHaveLength(2);
    const totals = result.totals as { totalBalance: Money };
    expect(totals.totalBalance.toDecimalString()).toBe("150000.0000");

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("t.academic_year_id = $1");
    expect(sql).toContain("i.status <> 'VOID'");
    expect(params).toEqual(["year-1"]);
  });
});
