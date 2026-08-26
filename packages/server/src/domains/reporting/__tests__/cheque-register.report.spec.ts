import { DataSource } from "typeorm";
import { ChequeRegisterReport } from "../application/cheque-register.report";
import { Money } from "../../../shared/money/money";

describe("ChequeRegisterReport", () => {
  let dataSource: { query: jest.Mock };
  let report: ChequeRegisterReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new ChequeRegisterReport(dataSource as unknown as DataSource);
  });

  it("lists issued cheque leaves for one account with a total", async () => {
    dataSource.query.mockResolvedValue([
      { leaf_no: 101, status: "CLEARED", payee: "ABC Supplies Ltd", amount: "25000.0000", issued_on: "2026-02-05", voucher_id: "voucher-1", status_reason: null },
      { leaf_no: 102, status: "STOPPED", payee: "XYZ Co", amount: "5000.0000", issued_on: "2026-02-10", voucher_id: "voucher-2", status_reason: "Lost cheque" },
    ]);

    const result = await report.execute({ bankAccountId: "acct-1", fromDate: "2026-02-01", toDate: "2026-02-28" });

    expect(result.rows).toHaveLength(2);
    const totals = result.totals as { leafCount: number; totalAmount: Money };
    expect(totals.leafCount).toBe(2);
    expect(totals.totalAmount.toDecimalString()).toBe("30000.0000");

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("b.account_id = $1");
    expect(sql).toContain("l.issued_on IS NOT NULL");
    expect(params).toEqual(["acct-1", "2026-02-01", "2026-02-28"]);
  });
});
