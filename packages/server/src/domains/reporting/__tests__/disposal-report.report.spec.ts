import { DataSource } from "typeorm";
import { DisposalReportReport } from "../application/disposal-report.report";
import { Money } from "../../../shared/money/money";

describe("DisposalReportReport", () => {
  let dataSource: { query: jest.Mock };
  let report: DisposalReportReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new DisposalReportReport(dataSource as unknown as DataSource);
  });

  it("lists posted disposals with derived NBV and totals", async () => {
    dataSource.query.mockResolvedValue([
      {
        code: "AST-0002",
        name: "Old Printer",
        category_name: "IT Equipment",
        method: "SALE",
        disposal_date: "2026-02-10",
        cost: "10000.0000",
        accum_depreciation: "9000.0000",
        proceeds: "500.0000",
        gain_loss: "-500.0000",
      },
    ]);

    const result = await report.execute({ fromDate: "2026-02-01", toDate: "2026-02-28" });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as { nbv: Money };
    expect(row.nbv.toDecimalString()).toBe("1000.0000");

    const totals = result.totals as { disposalCount: number; totalProceeds: Money; totalGainLoss: Money };
    expect(totals.disposalCount).toBe(1);
    expect(totals.totalProceeds.toDecimalString()).toBe("500.0000");
    expect(totals.totalGainLoss.toDecimalString()).toBe("-500.0000");

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("d.status = 'POSTED'");
    expect(sql).toContain("d.updated_at::date");
    expect(params).toEqual(["2026-02-01", "2026-02-28"]);
  });

  it("handles a null gain_loss without throwing", async () => {
    dataSource.query.mockResolvedValue([
      {
        code: "AST-0003",
        name: "Old Chair",
        category_name: "Furniture",
        method: "SCRAP",
        disposal_date: "2026-02-11",
        cost: "1000.0000",
        accum_depreciation: "1000.0000",
        proceeds: "0.0000",
        gain_loss: null,
      },
    ]);

    const result = await report.execute({ fromDate: "2026-02-01", toDate: "2026-02-28" });
    expect((result.rows[0] as { gainLoss: Money | null }).gainLoss).toBeNull();
  });
});
