import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface StockTakeVarianceParams {
  stockTakeId: string;
}

interface RawVarianceRow {
  code: string;
  name: string;
  snapshot_qty: string;
  counted_qty: string | null;
  variance_qty: string | null;
  variance_value: string | null;
}

/**
 * Per-item variance for one stock take, read directly from
 * `inv_stock_take_line` — **never** re-joined against live
 * `inv_stock_balance`, which can have drifted since the count's own
 * `snapshot_at`. `variance_qty` is a Postgres `GENERATED ALWAYS AS
 * (counted_qty - snapshot_qty) STORED` column; `snapshot_qty`/`counted_qty`/
 * `variance_qty` are raw decimals (NOT `Money`). `variance_value` IS `Money`
 * but nullable and, per that entity's own doc comment, may not yet be
 * populated by the current service layer — handled null-safe here, a real
 * inherited gap rather than a bug in this report.
 */
@Injectable()
export class StockTakeVarianceReport implements ReportDefinition<StockTakeVarianceParams> {
  readonly code = "stock-take-variance";
  readonly name = "Stock Take Variance Report";
  readonly domain = "inventory";
  readonly permissionCode = "reports:stock-take-variance:view";
  readonly paramsShape = { stockTakeId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "itemCode", label: "Item Code", type: "string" },
    { key: "itemName", label: "Item", type: "string" },
    { key: "snapshotQty", label: "Snapshot Qty", type: "number" },
    { key: "countedQty", label: "Counted Qty", type: "number" },
    { key: "varianceQty", label: "Variance Qty", type: "number" },
    { key: "varianceValue", label: "Variance Value", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: StockTakeVarianceParams): Promise<ReportResult> {
    const rawRows: RawVarianceRow[] = await this.dataSource.query(
      `SELECT i.code, i.name, l.snapshot_qty, l.counted_qty, l.variance_qty, l.variance_value
       FROM app.inv_stock_take_line l
       JOIN app.inv_item i ON i.id = l.item_id
       WHERE l.stock_take_id = $1
       ORDER BY i.name`,
      [params.stockTakeId],
    );

    let varianceCount = 0;
    const rows = rawRows.map((row) => {
      const varianceQty = row.variance_qty !== null ? Number(row.variance_qty) : null;
      if (varianceQty !== null && varianceQty !== 0) varianceCount += 1;
      return {
        itemCode: row.code,
        itemName: row.name,
        snapshotQty: Number(row.snapshot_qty),
        countedQty: row.counted_qty !== null ? Number(row.counted_qty) : null,
        varianceQty,
        varianceValue: row.variance_value !== null ? Money.fromDecimalString(row.variance_value) : null,
      };
    });

    return {
      rows,
      totals: { lineCount: rows.length, varianceCount },
      generatedAt: new Date(),
    };
  }
}
