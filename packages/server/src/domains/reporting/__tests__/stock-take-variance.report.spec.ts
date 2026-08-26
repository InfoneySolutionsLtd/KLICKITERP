import { DataSource } from "typeorm";
import { StockTakeVarianceReport } from "../application/stock-take-variance.report";
import { Money } from "../../../shared/money/money";

describe("StockTakeVarianceReport", () => {
  let dataSource: { query: jest.Mock };
  let report: StockTakeVarianceReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new StockTakeVarianceReport(dataSource as unknown as DataSource);
  });

  it("reads variance directly from inv_stock_take_line, handling a null variance_value", async () => {
    dataSource.query.mockResolvedValue([
      { code: "ITM-0001", name: "A4 Paper Ream", snapshot_qty: "100.0000", counted_qty: "95.0000", variance_qty: "-5.0000", variance_value: "-250.0000" },
      { code: "ITM-0002", name: "Pens (Box)", snapshot_qty: "40.0000", counted_qty: "40.0000", variance_qty: "0.0000", variance_value: null },
    ]);

    const result = await report.execute({ stockTakeId: "st-1" });

    expect(result.rows).toHaveLength(2);
    const first = result.rows[0] as { varianceQty: number; varianceValue: Money };
    expect(first.varianceQty).toBe(-5);
    expect(first.varianceValue.toDecimalString()).toBe("-250.0000");
    const second = result.rows[1] as { varianceValue: Money | null };
    expect(second.varianceValue).toBeNull();

    const totals = result.totals as { lineCount: number; varianceCount: number };
    expect(totals.lineCount).toBe(2);
    expect(totals.varianceCount).toBe(1);

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("l.stock_take_id = $1");
    expect(sql).not.toContain("inv_stock_balance");
    expect(params).toEqual(["st-1"]);
  });
});
