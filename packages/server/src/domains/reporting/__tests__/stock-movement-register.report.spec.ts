import { DataSource } from "typeorm";
import { StockMovementRegisterReport } from "../application/stock-movement-register.report";
import { Money } from "../../../shared/money/money";

describe("StockMovementRegisterReport", () => {
  let dataSource: { query: jest.Mock };
  let report: StockMovementRegisterReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new StockMovementRegisterReport(dataSource as unknown as DataSource);
  });

  it("nets signed qty/value across movements", async () => {
    dataSource.query.mockResolvedValue([
      { at: "2026-02-01T09:00:00.000Z", code: "ITM-0001", name: "A4 Paper Ream", movement_type: "RECEIPT", qty: "100.0000", unit_cost: "50.0000", value: "5000.0000", ref_doc_type: "GRN", ref_doc_id: "grn-1" },
      { at: "2026-02-02T09:00:00.000Z", code: "ITM-0001", name: "A4 Paper Ream", movement_type: "ISSUE", qty: "-20.0000", unit_cost: "50.0000", value: "-1000.0000", ref_doc_type: null, ref_doc_id: null },
    ]);

    const result = await report.execute({ storeId: "store-1", fromDate: "2026-02-01", toDate: "2026-02-28" });

    expect(result.rows).toHaveLength(2);
    const totals = result.totals as { movementCount: number; netQty: number; netValue: Money };
    expect(totals.movementCount).toBe(2);
    expect(totals.netQty).toBe(80);
    expect(totals.netValue.toDecimalString()).toBe("4000.0000");

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("m.store_id = $1");
    expect(sql).toContain("m.at::date");
    expect(params).toEqual(["store-1", "2026-02-01", "2026-02-28"]);
  });
});
