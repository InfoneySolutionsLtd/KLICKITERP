import { DataSource } from "typeorm";
import { StockBalanceReport } from "../application/stock-balance.report";
import { Money } from "../../../shared/money/money";

describe("StockBalanceReport", () => {
  let dataSource: { query: jest.Mock };
  let report: StockBalanceReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new StockBalanceReport(dataSource as unknown as DataSource);
  });

  it("parses qty as a plain number, not Money, and sums value", async () => {
    dataSource.query.mockResolvedValue([
      { code: "ITM-0001", name: "A4 Paper Ream", category_name: "Stationery", uom: "REAM", qty: "125.5000", value: "6275.0000", reorder_level: "50.0000" },
    ]);

    const result = await report.execute({ storeId: "store-1" });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as { qty: number; value: Money; reorderLevel: number };
    expect(row.qty).toBe(125.5);
    expect(row.value.toDecimalString()).toBe("6275.0000");
    expect(row.reorderLevel).toBe(50);

    const totals = result.totals as { itemCount: number; totalValue: Money };
    expect(totals.itemCount).toBe(1);
    expect(totals.totalValue.toDecimalString()).toBe("6275.0000");

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("sb.store_id = $1");
    expect(params).toEqual(["store-1"]);
  });
});
