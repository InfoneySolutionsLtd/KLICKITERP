import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface InvoiceBalanceByGradeParams {
  termId: string;
}

interface RawGradeRow {
  class_id: string;
  class_name: string;
  student_count: string;
  invoice_count: string;
  total_invoiced: string;
  total_paid: string;
  total_balance: string;
}

/**
 * Invoice balances for one term, grouped by grade. **Grade-accuracy design
 * (explicit user choice, not the simpler default)**: `std_student.class_id`
 * is a single mutable column with no historization — once a student is
 * promoted, it only ever reflects their CURRENT grade, so grouping a past
 * term's invoices by it would misattribute promoted/graduated students. For
 * `source='STRUCTURE'` invoices (the majority), `bill_invoice.fee_structure_id
 * → bill_fee_structure.class_id` is frozen at generation time and IS the
 * grade the invoice was actually raised for — used here via `COALESCE`,
 * falling back to the student's current class only for `ADHOC`/`RECURRING`/
 * `DEBIT_NOTE` invoices (`fee_structure_id IS NULL`), which have no such
 * anchor. `VOID` invoices are excluded — a voided invoice represents no real
 * charge, the same treatment every other balance-shaped report in this
 * module gives cancelled/void documents.
 */
@Injectable()
export class InvoiceBalanceByGradeReport implements ReportDefinition<InvoiceBalanceByGradeParams> {
  readonly code = "invoice-balance-by-grade";
  readonly name = "Invoice Balance by Grade";
  readonly domain = "billing";
  readonly permissionCode = "reports:invoice-balance-by-grade:view";
  readonly paramsShape = { termId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "className", label: "Grade", type: "string" },
    { key: "studentCount", label: "Students", type: "number" },
    { key: "invoiceCount", label: "Invoices", type: "number" },
    { key: "totalInvoiced", label: "Total Invoiced", type: "money" },
    { key: "totalPaid", label: "Total Paid", type: "money" },
    { key: "totalBalance", label: "Total Balance", type: "money" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(params: InvoiceBalanceByGradeParams): Promise<ReportResult> {
    const rawRows: RawGradeRow[] = await this.dataSource.query(
      `SELECT COALESCE(fs.class_id, s.class_id) AS class_id, c.name AS class_name,
              COUNT(DISTINCT i.student_id)::text AS student_count,
              COUNT(*)::text AS invoice_count,
              COALESCE(SUM(i.total), 0)::text AS total_invoiced,
              COALESCE(SUM(i.paid_amount), 0)::text AS total_paid,
              COALESCE(SUM(i.balance), 0)::text AS total_balance
       FROM app.bill_invoice i
       JOIN app.std_student s ON s.id = i.student_id
       LEFT JOIN app.bill_fee_structure fs ON fs.id = i.fee_structure_id
       JOIN app.std_class c ON c.id = COALESCE(fs.class_id, s.class_id)
       WHERE i.term_id = $1 AND i.status <> 'VOID'
       GROUP BY COALESCE(fs.class_id, s.class_id), c.name, c.level
       ORDER BY c.level ASC`,
      [params.termId],
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
        classId: row.class_id,
        className: row.class_name,
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
