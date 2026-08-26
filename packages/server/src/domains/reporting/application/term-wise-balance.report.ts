import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface TermWiseBalanceParams {
  academicYearId: string;
}

interface RawTermRow {
  term_id: string;
  term_name: string;
  student_count: string;
  invoice_count: string;
  total_invoiced: string;
  total_paid: string;
  total_balance: string;
}

/**
 * Invoice balances for one academic year, grouped by term — the complement
 * of `InvoiceBalanceByGradeReport` (that one is "one term, by grade"; this
 * is "one year, by term"). `bill_invoice.term_id` is a direct, stable FK —
 * no grade-historization concern here since class/grade never enters this
 * query at all. `VOID` invoices excluded, same as every other balance-shaped
 * report in this module.
 */
@Injectable()
export class TermWiseBalanceReport implements ReportDefinition<TermWiseBalanceParams> {
  readonly code = "term-wise-balance";
  readonly name = "Term-wise Balance Report";
  readonly domain = "billing";
  readonly permissionCode = "reports:term-wise-balance:view";
  readonly paramsShape = { academicYearId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "termName", label: "Term", type: "string" },
    { key: "studentCount", label: "Students", type: "number" },
    { key: "invoiceCount", label: "Invoices", type: "number" },
    { key: "totalInvoiced", label: "Total Invoiced", type: "money" },
    { key: "totalPaid", label: "Total Paid", type: "money" },
    { key: "totalBalance", label: "Total Balance", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: TermWiseBalanceParams): Promise<ReportResult> {
    const rawRows: RawTermRow[] = await this.dataSource.query(
      `SELECT t.id AS term_id, t.name AS term_name,
              COUNT(DISTINCT i.student_id)::text AS student_count,
              COUNT(*)::text AS invoice_count,
              COALESCE(SUM(i.total), 0)::text AS total_invoiced,
              COALESCE(SUM(i.paid_amount), 0)::text AS total_paid,
              COALESCE(SUM(i.balance), 0)::text AS total_balance
       FROM app.bill_invoice i
       JOIN app.set_term t ON t.id = i.term_id
       WHERE t.academic_year_id = $1 AND i.status <> 'VOID'
       GROUP BY t.id, t.name, t.seq
       ORDER BY t.seq ASC`,
      [params.academicYearId],
    );

    let totalInvoiced = Money.ZERO;
    let totalPaid = Money.ZERO;
    let totalBalance = Money.ZERO;
    let studentCount = 0;
    let invoiceCount = 0;
    const rows = rawRows.map((row) => {
      const invoiced = Money.fromDecimalString(row.total_invoiced);
      const paid = Money.fromDecimalString(row.total_paid);
      const balance = Money.fromDecimalString(row.total_balance);
      totalInvoiced = totalInvoiced.add(invoiced);
      totalPaid = totalPaid.add(paid);
      totalBalance = totalBalance.add(balance);
      studentCount += Number(row.student_count);
      invoiceCount += Number(row.invoice_count);
      return {
        termId: row.term_id,
        termName: row.term_name,
        studentCount: Number(row.student_count),
        invoiceCount: Number(row.invoice_count),
        totalInvoiced: invoiced,
        totalPaid: paid,
        totalBalance: balance,
      };
    });

    return {
      rows,
      totals: { studentCount, invoiceCount, totalInvoiced, totalPaid, totalBalance },
      generatedAt: new Date(),
    };
  }
}
