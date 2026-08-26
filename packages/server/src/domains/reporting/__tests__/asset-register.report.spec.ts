import { DataSource } from "typeorm";
import { AssetRegisterReport } from "../application/asset-register.report";
import { Money } from "../../../shared/money/money";

describe("AssetRegisterReport", () => {
  let dataSource: { query: jest.Mock };
  let report: AssetRegisterReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new AssetRegisterReport(dataSource as unknown as DataSource);
  });

  it("lists assets with a computed NBV and totals", async () => {
    dataSource.query.mockResolvedValue([
      {
        code: "AST-0001",
        name: "Dell Laptop",
        category_name: "IT Equipment",
        status: "ACTIVE",
        custodian_name: "Jane Doe",
        location: "Main Office",
        acquisition_date: "2025-01-10",
        cost: "80000.0000",
        accum_depreciation: "20000.0000",
        funding_source: "SCHOOL",
      },
    ]);

    const result = await report.execute();

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as { nbv: Money; cost: Money };
    expect(row.nbv.toDecimalString()).toBe("60000.0000");

    const totals = result.totals as { assetCount: number; totalCost: Money; totalNbv: Money };
    expect(totals.assetCount).toBe(1);
    expect(totals.totalCost.toDecimalString()).toBe("80000.0000");
    expect(totals.totalNbv.toDecimalString()).toBe("60000.0000");

    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain("app.fa_asset a");
    expect(sql).toContain("LEFT JOIN app.usr_user u ON u.id = a.custodian_user_id");
  });

  it("takes no params", () => {
    expect(report.paramsShape).toEqual({});
  });
});
