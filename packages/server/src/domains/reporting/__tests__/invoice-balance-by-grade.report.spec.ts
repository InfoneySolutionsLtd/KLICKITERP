import { DataSource } from "typeorm";
import { InvoiceBalanceByGradeReport } from "../application/invoice-balance-by-grade.report";
import { Money } from "../../../shared/money/money";

describe("InvoiceBalanceByGradeReport", () => {
  let dataSource: { query: jest.Mock };
  let report: InvoiceBalanceByGradeReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new InvoiceBalanceByGradeReport(dataSource as unknown as DataSource);
  });

  it("groups invoice totals by grade with grand totals", async () => {
    dataSource.query.mockResolvedValue([
      {
        class_id: "class-1",
        class_name: "Grade 4",
        student_count: "10",
        invoice_count: "12",
        total_invoiced: "120000.0000",
        total_paid: "80000.0000",
        total_balance: "40000.0000",
      },
      {
        class_id: "class-2",
        class_name: "Grade 5",
        student_count: "8",
        invoice_count: "8",
        total_invoiced: "90000.0000",
        total_paid: "90000.0000",
        total_balance: "0.0000",
      },
    ]);

    const result = await report.execute({ termId: "term-1" });

    expect(result.rows).toHaveLength(2);
    const totals = result.totals as { studentCount: number; invoiceCount: number; totalBalance: Money };
    expect(totals.studentCount).toBe(18);
    expect(totals.invoiceCount).toBe(20);
    expect(totals.totalBalance.toDecimalString()).toBe("40000.0000");

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("COALESCE(fs.class_id, s.class_id)");
    expect(sql).toContain("i.status <> 'VOID'");
    expect(params).toEqual(["term-1"]);
  });
});
