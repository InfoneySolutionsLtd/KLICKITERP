import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface ChequeRegisterParams {
  bankAccountId: string;
  fromDate: string;
  toDate: string;
}

interface RawChequeLeafRow {
  leaf_no: number;
  status: string;
  payee: string | null;
  amount: string;
  issued_on: string;
  voucher_id: string | null;
  status_reason: string | null;
}

/**
 * Issued cheque leaves for one bank account within a date range, dated by
 * `issued_on`. A leaf carries no direct `account_id` of its own — joined
 * through its book (`bank_cheque_leaf.book_id -> bank_cheque_book.account_id`).
 * Excludes `UNUSED` leaves (`issued_on IS NULL`, `amount IS NULL` — never
 * issued, nothing to register). The real status enum has **no literal
 * `BOUNCED`** value (`UNUSED|ISSUED|PRESENTED|CLEARED|STOPPED|CANCELLED|STALE`)
 * — this report surfaces the raw `status` plus `statusReason` text rather
 * than inventing a bucket that doesn't exist in the schema.
 */
@Injectable()
export class ChequeRegisterReport implements ReportDefinition<ChequeRegisterParams> {
  readonly code = "cheque-register";
  readonly name = "Cheque Register";
  readonly domain = "banking";
  readonly permissionCode = "reports:cheque-register:view";
  readonly paramsShape = { bankAccountId: "uuid", fromDate: "date", toDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "leafNo", label: "Leaf No.", type: "number" },
    { key: "status", label: "Status", type: "string" },
    { key: "payee", label: "Payee", type: "string" },
    { key: "amount", label: "Amount", type: "money" },
    { key: "issuedOn", label: "Issued On", type: "date" },
    { key: "voucherId", label: "Voucher Id", type: "string" },
    { key: "statusReason", label: "Status Reason", type: "string" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: ChequeRegisterParams): Promise<ReportResult> {
    const rawRows: RawChequeLeafRow[] = await this.dataSource.query(
      `SELECT l.leaf_no, l.status, l.payee, l.amount, l.issued_on::text, l.voucher_id, l.status_reason
       FROM app.bank_cheque_leaf l
       JOIN app.bank_cheque_book b ON b.id = l.book_id
       WHERE b.account_id = $1 AND l.issued_on IS NOT NULL
         AND l.issued_on >= $2 AND l.issued_on <= $3
       ORDER BY l.issued_on ASC, l.leaf_no ASC`,
      [params.bankAccountId, params.fromDate, params.toDate],
    );

    let totalAmount = Money.ZERO;
    const rows = rawRows.map((row) => {
      const amount = Money.fromDecimalString(row.amount);
      totalAmount = totalAmount.add(amount);
      return {
        leafNo: row.leaf_no,
        status: row.status,
        payee: row.payee,
        amount,
        issuedOn: row.issued_on,
        voucherId: row.voucher_id,
        statusReason: row.status_reason,
      };
    });

    return {
      rows,
      totals: { leafCount: rows.length, totalAmount },
      generatedAt: new Date(),
    };
  }
}
