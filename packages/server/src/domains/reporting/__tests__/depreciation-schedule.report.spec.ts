import { DataSource } from "typeorm";
import { DepreciationScheduleReport } from "../application/depreciation-schedule.report";
import { Money } from "../../../shared/money/money";

describe("DepreciationScheduleReport", () => {
  let dataSource: { query: jest.Mock };
  let report: DepreciationScheduleReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new DepreciationScheduleReport(dataSource as unknown as DataSource);
  });

  it("computes opening NBV from closing NBV + amount, with a period label", async () => {
    dataSource.query
      .mockResolvedValueOnce([{ status: "POSTED", fiscal_year_name: "FY2026", seq: 3, starts_on: "2026-03-01", ends_on: "2026-03-31" }])
      .mockResolvedValueOnce([
        { code: "AST-0001", name: "Dell Laptop", category_name: "IT Equipment", amount: "1000.0000", nbv_after: "59000.0000" },
      ]);

    const result = await report.execute({ depreciationRunId: "run-1" });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as { openingNbv: Money; closingNbv: Money };
    expect(row.openingNbv.toDecimalString()).toBe("60000.0000");
    expect(row.closingNbv.toDecimalString()).toBe("59000.0000");

    const totals = result.totals as { periodLabel: string; runStatus: string; totalDepreciation: Money; assetCount: number };
    expect(totals.periodLabel).toBe("FY2026 P3 (2026-03-01 – 2026-03-31)");
    expect(totals.runStatus).toBe("POSTED");
    expect(totals.totalDepreciation.toDecimalString()).toBe("1000.0000");
    expect(totals.assetCount).toBe(1);
  });

  it("throws NotFoundException when the run doesn't exist", async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await expect(report.execute({ depreciationRunId: "missing" })).rejects.toThrow("FaDepreciationRun not found: missing");
  });
});
