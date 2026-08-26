import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface VehicleExpenseParams {
  fromDate: string;
  toDate: string;
  routeId: string;
}

interface RawVehicleExpenseRow {
  route_name: string;
  bus: string | null;
  voucher_number: string;
  voucher_date: string;
  narrative: string;
  status: string;
  amount: string;
}

/**
 * Transport/vehicle expenses for one route within a date range. A bus
 * expense is a real `exp_voucher` (amount, narrative, status, GL posting)
 * linked to its route via `bill_transport_expense` — this report joins
 * through that link table rather than filtering `exp_voucher.category_id`
 * directly, since the join also yields the route's own name/`bus` plate for
 * display, which the category alone doesn't. **Period-axis judgement call**:
 * `exp_voucher` has no dedicated business/expense date column, only
 * `created_at`/`updated_at` audit timestamps — this report uses
 * `created_at::date` as the period axis, the same documented workaround
 * `expense-summary.report.ts` already established for the identical gap.
 * `CANCELLED` vouchers are excluded — a cancelled voucher represents no real
 * spend.
 */
@Injectable()
export class VehicleExpenseReport implements ReportDefinition<VehicleExpenseParams> {
  readonly code = "vehicle-expense";
  readonly name = "Vehicle Expense Report";
  readonly domain = "billing";
  readonly permissionCode = "reports:vehicle-expense:view";
  readonly paramsShape = { fromDate: "date", toDate: "date", routeId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "routeName", label: "Route", type: "string" },
    { key: "bus", label: "Bus", type: "string" },
    { key: "voucherNumber", label: "Voucher No.", type: "string" },
    { key: "date", label: "Date", type: "date" },
    { key: "narrative", label: "Narrative", type: "string" },
    { key: "status", label: "Status", type: "string" },
    { key: "amount", label: "Amount", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: VehicleExpenseParams): Promise<ReportResult> {
    const rawRows: RawVehicleExpenseRow[] = await this.dataSource.query(
      `SELECT r.name AS route_name, r.bus, v.number AS voucher_number,
              v.created_at::date::text AS voucher_date, v.narrative, v.status, v.amount
       FROM app.bill_transport_expense bte
       JOIN app.exp_voucher v ON v.id = bte.voucher_id
       JOIN app.bill_transport_route r ON r.id = bte.route_id
       WHERE v.created_at::date >= $1 AND v.created_at::date <= $2
         AND bte.route_id = $3 AND v.status <> 'CANCELLED'
       ORDER BY v.created_at ASC`,
      [params.fromDate, params.toDate, params.routeId],
    );

    let totalAmount = Money.ZERO;
    const rows = rawRows.map((row) => {
      const amount = Money.fromDecimalString(row.amount);
      totalAmount = totalAmount.add(amount);
      return {
        routeName: row.route_name,
        bus: row.bus,
        voucherNumber: row.voucher_number,
        date: row.voucher_date,
        narrative: row.narrative,
        status: row.status,
        amount,
      };
    });

    return {
      rows,
      totals: { totalAmount, voucherCount: rows.length },
      generatedAt: new Date(),
    };
  }
}
