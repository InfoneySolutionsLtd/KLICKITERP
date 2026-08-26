import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface DepreciationScheduleParams {
  depreciationRunId: string;
}

interface RawRunRow {
  status: string;
  fiscal_year_name: string;
  seq: number;
  starts_on: string;
  ends_on: string;
}

interface RawLineRow {
  code: string;
  name: string;
  category_name: string;
  amount: string;
  nbv_after: string;
}

/**
 * One `fa_depreciation_run`'s posted (or draft) lines, per-asset. `nbv_after`
 * is stored directly on `fa_depreciation_line` (not derived) — opening NBV
 * for display is computed here as `nbv_after + amount`, since
 * `nbv_after = nbv_before - amount` by construction. `depreciationRunId`
 * (not `runId`) is the param key deliberately — `runId` is already claimed
 * by `PayrollRunSelect` in `UUID_PARAM_PICKERS`, a different entity kind.
 */
@Injectable()
export class DepreciationScheduleReport implements ReportDefinition<DepreciationScheduleParams> {
  readonly code = "depreciation-schedule";
  readonly name = "Depreciation Schedule";
  readonly domain = "fixed-assets";
  readonly permissionCode = "reports:depreciation-schedule:view";
  readonly paramsShape = { depreciationRunId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "assetCode", label: "Asset Code", type: "string" },
    { key: "assetName", label: "Asset", type: "string" },
    { key: "categoryName", label: "Category", type: "string" },
    { key: "openingNbv", label: "Opening NBV", type: "money" },
    { key: "amount", label: "Depreciation", type: "money" },
    { key: "closingNbv", label: "Closing NBV", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: DepreciationScheduleParams): Promise<ReportResult> {
    const runRows: RawRunRow[] = await this.dataSource.query(
      `SELECT r.status, fy.name AS fiscal_year_name, p.seq, p.starts_on::text, p.ends_on::text
       FROM app.fa_depreciation_run r
       JOIN app.gl_period p ON p.id = r.period_id
       JOIN app.gl_fiscal_year fy ON fy.id = p.fiscal_year_id
       WHERE r.id = $1`,
      [params.depreciationRunId],
    );
    const run = runRows[0];
    if (!run) {
      throw new NotFoundException("FaDepreciationRun", params.depreciationRunId);
    }

    const rawRows: RawLineRow[] = await this.dataSource.query(
      `SELECT a.code, a.name, c.name AS category_name, dl.amount, dl.nbv_after
       FROM app.fa_depreciation_line dl
       JOIN app.fa_asset a ON a.id = dl.asset_id
       JOIN app.fa_category c ON c.id = a.category_id
       WHERE dl.run_id = $1
       ORDER BY c.name, a.code`,
      [params.depreciationRunId],
    );

    let totalDepreciation = Money.ZERO;
    const rows = rawRows.map((row) => {
      const amount = Money.fromDecimalString(row.amount);
      const closingNbv = Money.fromDecimalString(row.nbv_after);
      const openingNbv = closingNbv.add(amount);
      totalDepreciation = totalDepreciation.add(amount);
      return {
        assetCode: row.code,
        assetName: row.name,
        categoryName: row.category_name,
        openingNbv,
        amount,
        closingNbv,
      };
    });

    return {
      rows,
      totals: {
        periodLabel: `${run.fiscal_year_name} P${run.seq} (${run.starts_on} – ${run.ends_on})`,
        runStatus: run.status,
        totalDepreciation,
        assetCount: rows.length,
      },
      generatedAt: new Date(),
    };
  }
}
