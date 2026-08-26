import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export type AssetRegisterParams = Record<string, never>;

interface RawAssetRow {
  code: string;
  name: string;
  category_name: string;
  status: string;
  custodian_name: string | null;
  location: string | null;
  acquisition_date: string;
  cost: string;
  accum_depreciation: string;
  funding_source: string;
}

/**
 * The full `fa_asset` book — no params, a register is definitionally the
 * whole thing (same `paramsShape = {}` shape `siblings.report.ts`
 * established for a full-listing report with no natural required filter).
 * `accum_depreciation` is stored directly on `fa_asset` (not derived from
 * `fa_depreciation_line`), so NBV is a simple `cost - accum_depreciation`
 * computed here, not a second query.
 */
@Injectable()
export class AssetRegisterReport implements ReportDefinition<AssetRegisterParams> {
  readonly code = "asset-register";
  readonly name = "Asset Register";
  readonly domain = "fixed-assets";
  readonly permissionCode = "reports:asset-register:view";
  readonly paramsShape = {} as const;
  readonly columns: ReportColumnDef[] = [
    { key: "assetCode", label: "Asset Code", type: "string" },
    { key: "name", label: "Name", type: "string" },
    { key: "categoryName", label: "Category", type: "string" },
    { key: "status", label: "Status", type: "string" },
    { key: "custodianName", label: "Custodian", type: "string" },
    { key: "location", label: "Location", type: "string" },
    { key: "acquisitionDate", label: "Acquired On", type: "date" },
    { key: "cost", label: "Cost", type: "money" },
    { key: "accumDepreciation", label: "Accum. Depreciation", type: "money" },
    { key: "nbv", label: "NBV", type: "money" },
    { key: "fundingSource", label: "Funding Source", type: "string" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(): Promise<ReportResult> {
    const rawRows: RawAssetRow[] = await this.dataSource.query(
      `SELECT a.code, a.name, c.name AS category_name, a.status, u.full_name AS custodian_name,
              a.location, a.acquisition_date::text, a.cost, a.accum_depreciation, a.funding_source
       FROM app.fa_asset a
       JOIN app.fa_category c ON c.id = a.category_id
       LEFT JOIN app.usr_user u ON u.id = a.custodian_user_id
       ORDER BY c.name, a.code`,
    );

    let totalCost = Money.ZERO;
    let totalAccumDepreciation = Money.ZERO;
    let totalNbv = Money.ZERO;
    const rows = rawRows.map((row) => {
      const cost = Money.fromDecimalString(row.cost);
      const accumDepreciation = Money.fromDecimalString(row.accum_depreciation);
      const nbv = cost.subtract(accumDepreciation);
      totalCost = totalCost.add(cost);
      totalAccumDepreciation = totalAccumDepreciation.add(accumDepreciation);
      totalNbv = totalNbv.add(nbv);
      return {
        assetCode: row.code,
        name: row.name,
        categoryName: row.category_name,
        status: row.status,
        custodianName: row.custodian_name,
        location: row.location,
        acquisitionDate: row.acquisition_date,
        cost,
        accumDepreciation,
        nbv,
        fundingSource: row.funding_source,
      };
    });

    return {
      rows,
      totals: { assetCount: rows.length, totalCost, totalAccumDepreciation, totalNbv },
      generatedAt: new Date(),
    };
  }
}
