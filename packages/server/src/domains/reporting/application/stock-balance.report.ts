import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface StockBalanceParams {
  storeId: string;
}

interface RawStockBalanceRow {
  code: string;
  name: string;
  category_name: string | null;
  uom: string;
  qty: string;
  value: string;
  reorder_level: string | null;
}

/**
 * Live per-item balances for one store, straight off `inv_stock_balance`
 * (real, row-locked-on-update, always up to date — the same real endpoint
 * `GET /inventory/stock-movements/balances?storeId=` already reads). `qty`/
 * `reorder_level` are raw `NUMERIC(14,4)` — NOT `Money` — parsed as plain
 * numbers; `value` is real `Money`.
 */
@Injectable()
export class StockBalanceReport implements ReportDefinition<StockBalanceParams> {
  readonly code = "stock-balance";
  readonly name = "Stock Balance Report";
  readonly domain = "inventory";
  readonly permissionCode = "reports:stock-balance:view";
  readonly paramsShape = { storeId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "itemCode", label: "Item Code", type: "string" },
    { key: "itemName", label: "Item", type: "string" },
    { key: "categoryName", label: "Category", type: "string" },
    { key: "uom", label: "UoM", type: "string" },
    { key: "qty", label: "Qty", type: "number" },
    { key: "value", label: "Value", type: "money" },
    { key: "reorderLevel", label: "Reorder Level", type: "number" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: StockBalanceParams): Promise<ReportResult> {
    const rawRows: RawStockBalanceRow[] = await this.dataSource.query(
      `SELECT i.code, i.name, c.name AS category_name, i.uom, sb.qty, sb.value, i.reorder_level
       FROM app.inv_stock_balance sb
       JOIN app.inv_item i ON i.id = sb.item_id
       LEFT JOIN app.inv_category c ON c.id = i.category_id
       WHERE sb.store_id = $1
       ORDER BY i.name`,
      [params.storeId],
    );

    let totalValue = Money.ZERO;
    const rows = rawRows.map((row) => {
      const value = Money.fromDecimalString(row.value);
      totalValue = totalValue.add(value);
      return {
        itemCode: row.code,
        itemName: row.name,
        categoryName: row.category_name,
        uom: row.uom,
        qty: Number(row.qty),
        value,
        reorderLevel: row.reorder_level !== null ? Number(row.reorder_level) : null,
      };
    });

    return {
      rows,
      totals: { itemCount: rows.length, totalValue },
      generatedAt: new Date(),
    };
  }
}
