import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface DisposalReportParams {
  fromDate: string;
  toDate: string;
}

interface RawDisposalRow {
  code: string;
  name: string;
  category_name: string;
  method: string;
  disposal_date: string;
  cost: string;
  accum_depreciation: string;
  proceeds: string;
  gain_loss: string | null;
}

/**
 * Disposed assets within a date range. **Documented gap** (the same class of
 * gap `vehicle-expense.report.ts` already established for `exp_voucher`):
 * `fa_disposal` has no `disposal_date` column, only the inherited
 * `updated_at`/`created_at` audit timestamps — this report uses
 * `updated_at::date` as the period axis, restricted to `status = 'POSTED'`
 * (the only meaningful, completed disposals; `gain_loss` is only computed
 * once a disposal reaches POSTED). NBV-at-disposal is derived the same way
 * Asset Register derives current NBV (`cost - accum_depreciation`) — both
 * columns are frozen on the asset once disposed (`trg_fa_disposal_immutable`).
 */
@Injectable()
export class DisposalReportReport implements ReportDefinition<DisposalReportParams> {
  readonly code = "disposal-report";
  readonly name = "Disposal Report";
  readonly domain = "fixed-assets";
  readonly permissionCode = "reports:disposal-report:view";
  readonly paramsShape = { fromDate: "date", toDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "assetCode", label: "Asset Code", type: "string" },
    { key: "assetName", label: "Asset", type: "string" },
    { key: "categoryName", label: "Category", type: "string" },
    { key: "method", label: "Method", type: "string" },
    { key: "disposalDate", label: "Disposal Date", type: "date" },
    { key: "cost", label: "Cost", type: "money" },
    { key: "accumDepreciation", label: "Accum. Depreciation", type: "money" },
    { key: "nbv", label: "NBV", type: "money" },
    { key: "proceeds", label: "Proceeds", type: "money" },
    { key: "gainLoss", label: "Gain / (Loss)", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: DisposalReportParams): Promise<ReportResult> {
    const rawRows: RawDisposalRow[] = await this.dataSource.query(
      `SELECT a.code, a.name, c.name AS category_name, d.method, d.updated_at::date::text AS disposal_date,
              a.cost, a.accum_depreciation, d.proceeds, d.gain_loss
       FROM app.fa_disposal d
       JOIN app.fa_asset a ON a.id = d.asset_id
       JOIN app.fa_category c ON c.id = a.category_id
       WHERE d.status = 'POSTED' AND d.updated_at::date >= $1 AND d.updated_at::date <= $2
       ORDER BY d.updated_at ASC`,
      [params.fromDate, params.toDate],
    );

    let totalProceeds = Money.ZERO;
    let totalGainLoss = Money.ZERO;
    const rows = rawRows.map((row) => {
      const cost = Money.fromDecimalString(row.cost);
      const accumDepreciation = Money.fromDecimalString(row.accum_depreciation);
      const proceeds = Money.fromDecimalString(row.proceeds);
      const gainLoss = row.gain_loss !== null ? Money.fromDecimalString(row.gain_loss) : null;
      totalProceeds = totalProceeds.add(proceeds);
      if (gainLoss) totalGainLoss = totalGainLoss.add(gainLoss);
      return {
        assetCode: row.code,
        assetName: row.name,
        categoryName: row.category_name,
        method: row.method,
        disposalDate: row.disposal_date,
        cost,
        accumDepreciation,
        nbv: cost.subtract(accumDepreciation),
        proceeds,
        gainLoss,
      };
    });

    return {
      rows,
      totals: { disposalCount: rows.length, totalProceeds, totalGainLoss },
      generatedAt: new Date(),
    };
  }
}
