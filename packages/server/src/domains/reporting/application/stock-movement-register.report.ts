import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface StockMovementRegisterParams {
  storeId: string;
  fromDate: string;
  toDate: string;
}

interface RawMovementRow {
  at: string;
  code: string;
  name: string;
  movement_type: string;
  qty: string;
  unit_cost: string;
  value: string;
  ref_doc_type: string | null;
  ref_doc_id: string | null;
}

/**
 * Every `inv_movement` row for one store within a date range, dated by the
 * real `at` transaction timestamp (not `created_at`) — backed by the
 * existing composite index `ix_inv_movement_item_store_at (item_id,
 * store_id, at)`. `qty`/`unit_cost` are raw signed decimals (NOT `Money`);
 * `value` is real, signed `Money` (positive for RECEIPT/TRANSFER_IN/RETURN,
 * negative for ISSUE/SALE/TRANSFER_OUT, either sign for ADJUSTMENT), so
 * `netValue` in totals nets in/out rather than summing magnitudes.
 */
@Injectable()
export class StockMovementRegisterReport implements ReportDefinition<StockMovementRegisterParams> {
  readonly code = "stock-movement-register";
  readonly name = "Stock Movement Register";
  readonly domain = "inventory";
  readonly permissionCode = "reports:stock-movement-register:view";
  readonly paramsShape = { storeId: "uuid", fromDate: "date", toDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "date", label: "Date", type: "date" },
    { key: "itemCode", label: "Item Code", type: "string" },
    { key: "itemName", label: "Item", type: "string" },
    { key: "movementType", label: "Type", type: "string" },
    { key: "qty", label: "Qty", type: "number" },
    { key: "unitCost", label: "Unit Cost", type: "number" },
    { key: "value", label: "Value", type: "money" },
    { key: "refDocType", label: "Ref Type", type: "string" },
    { key: "refDocId", label: "Ref Id", type: "string" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: StockMovementRegisterParams): Promise<ReportResult> {
    const rawRows: RawMovementRow[] = await this.dataSource.query(
      `SELECT m.at::text AS at, i.code, i.name, m.movement_type, m.qty, m.unit_cost, m.value,
              m.ref_doc_type, m.ref_doc_id
       FROM app.inv_movement m
       JOIN app.inv_item i ON i.id = m.item_id
       WHERE m.store_id = $1 AND m.at::date >= $2 AND m.at::date <= $3
       ORDER BY m.at ASC`,
      [params.storeId, params.fromDate, params.toDate],
    );

    let netQty = 0;
    let netValue = Money.ZERO;
    const rows = rawRows.map((row) => {
      const qty = Number(row.qty);
      const value = Money.fromDecimalString(row.value);
      netQty += qty;
      netValue = netValue.add(value);
      return {
        date: row.at,
        itemCode: row.code,
        itemName: row.name,
        movementType: row.movement_type,
        qty,
        unitCost: Number(row.unit_cost),
        value,
        refDocType: row.ref_doc_type,
        refDocId: row.ref_doc_id,
      };
    });

    return {
      rows,
      totals: { movementCount: rows.length, netQty, netValue },
      generatedAt: new Date(),
    };
  }
}
