import { DataSource } from "typeorm";
import { VehicleExpenseReport } from "../application/vehicle-expense.report";
import { Money } from "../../../shared/money/money";

describe("VehicleExpenseReport", () => {
  let dataSource: { query: jest.Mock };
  let report: VehicleExpenseReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new VehicleExpenseReport(dataSource as unknown as DataSource);
  });

  it("lists vehicle expenses for one route with a total", async () => {
    dataSource.query.mockResolvedValue([
      {
        route_name: "Zone B",
        bus: "KDA 123X",
        voucher_number: "EXP-000001",
        voucher_date: "2026-01-15",
        narrative: "Engine Repair",
        status: "APPROVED",
        amount: "50000.0000",
      },
    ]);

    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31", routeId: "route-1" });

    expect(result.rows).toHaveLength(1);
    const totals = result.totals as { totalAmount: Money; voucherCount: number };
    expect(totals.totalAmount.toDecimalString()).toBe("50000.0000");
    expect(totals.voucherCount).toBe(1);

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("bte.route_id = $3");
    expect(sql).toContain("v.status <> 'CANCELLED'");
    expect(params).toEqual(["2026-01-01", "2026-01-31", "route-1"]);
  });
});
