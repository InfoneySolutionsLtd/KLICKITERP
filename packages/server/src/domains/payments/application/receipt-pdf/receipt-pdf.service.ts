import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ThemesService } from "../../../../platform/branding";
import { DocumentVerificationService } from "../../../../platform/document-verification";
import { FilesService } from "../../../../platform/files";
import { AppConfigService } from "../../../../shared/config/app-config.service";
import { NotFoundException } from "../../../../shared/exceptions/not-found.exception";
import { PAYMENT_RECEIPT_DOCUMENT_TYPE } from "../receipts.service";
import { describeReceiptAllocation, describeReceiptMethod } from "./receipt-labels";
import { renderReceiptPdf, type ReceiptPdfAccount, type ReceiptPdfBranding, type ReceiptPdfData, type ReceiptPdfVerification } from "./receipt-pdf.renderer";

/** The most invoices listed on one receipt; any further open invoices are still counted in the total balance. */
export const MAX_INVOICES_ON_RECEIPT = 25;

interface ReceiptRow {
  id: string;
  student_id: string;
  number: string;
  date: string;
  total: string;
  status: "POSTED" | "REVERSED";
  payer_name: string;
  reversal_of_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  admission_no: string;
  class_name: string;
}

function clean(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Prints a payment receipt as a PDF: the school's letterhead (the Branding page's logo and header/footer text), the receipt
 * as the books hold it, and the QR code of its public verification address (the token every captured receipt already has —
 * this service only READS it; it never mints one and never writes anything).
 *
 * It shows the learner's CURRENT total balance across all their open invoices, and each invoice with its amount, paid and
 * balance and its fee categories (see `loadAccount`). It does NOT print the receipt's own `balance_after`: that is a running-ledger
 * snapshot taken when the receipt was captured and routinely differs from what the learner owes now, so it would contradict the
 * parent portal's invoices. The account figures are as at the moment the PDF is made, and the PDF says so.
 *
 * A reversal's contra-receipt is not a document anyone is meant to be handed, so it is a not-found here, exactly as if it did
 * not exist; the ORIGINAL receipt that was reversed prints with a clear "REVERSED" mark.
 *
 * Branding is presentation: a missing logo, an unreadable image or a storage hiccup drops that one element (logged) and the
 * receipt still prints. The QR code is omitted, not faked, for a receipt that predates verification tokens.
 */
@Injectable()
export class ReceiptPdfService {
  private readonly logger = new Logger(ReceiptPdfService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly themesService: ThemesService,
    private readonly filesService: FilesService,
    private readonly documentVerification: DocumentVerificationService,
    private readonly config: AppConfigService,
  ) {}

  async render(receiptId: string): Promise<{ filename: string; buffer: Buffer }> {
    const rows: ReceiptRow[] = await this.dataSource.query(
      `
      SELECT r.id, r.student_id, r.number, to_char(r.receipt_date, 'YYYY-MM-DD') AS date, r.total::text AS total, r.status, r.payer_name,
             r.reversal_of_id,
             s.first_name, s.middle_name, s.last_name, s.admission_no, c.name AS class_name
        FROM app.pay_receipt r
        JOIN app.std_student s ON s.id = r.student_id
        JOIN app.std_class c ON c.id = s.class_id
       WHERE r.id = $1::uuid
      `,
      [receiptId],
    );
    const row = rows[0];
    if (!row || row.reversal_of_id !== null) {
      throw new NotFoundException("PayReceipt", receiptId);
    }

    const [splits, allocations, account, branding, verification] = await Promise.all([
      this.dataSource.query(`SELECT method, amount::text AS amount, external_ref FROM app.pay_receipt_split WHERE receipt_id = $1::uuid ORDER BY id`, [row.id]) as Promise<
        Array<{ method: string; amount: string; external_ref: string | null }>
      >,
      this.dataSource.query(
        `
        SELECT a.amount::text AS amount, a.to_prepayment, i.number AS invoice_number
          FROM app.pay_receipt_allocation a
          LEFT JOIN app.bill_invoice i ON i.id = a.invoice_id
         WHERE a.receipt_id = $1::uuid
         ORDER BY a.id
        `,
        [row.id],
      ) as Promise<Array<{ amount: string; to_prepayment: boolean; invoice_number: string | null }>>,
      this.loadAccount(row.student_id, row.id),
      this.loadBranding(),
      this.loadVerification(row.id, row.number),
    ]);

    const receipt: ReceiptPdfData = {
      number: row.number,
      date: row.date,
      status: row.status,
      amount: row.total,
      payerName: row.payer_name,
      learnerName: [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" "),
      admissionNo: row.admission_no,
      className: row.class_name,
      methods: splits.map((split) => ({ ...describeReceiptMethod(split.method, split.external_ref), amount: split.amount })),
      appliedTo: allocations.map((allocation) => ({
        label: describeReceiptAllocation({ toPrepayment: allocation.to_prepayment, invoiceNumber: allocation.invoice_number }),
        amount: allocation.amount,
      })),
      account,
    };

    const buffer = await renderReceiptPdf({ receipt, branding, verification, generatedAt: new Date() });
    return { filename: `receipt-${row.number.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`, buffer };
  }

  /**
   * The learner's account across ALL their invoices, from the invoices themselves — the same figures the parent portal shows,
   * so the receipt can never contradict the invoices page. Open invoices are the posted and part-paid ones that still owe
   * something; an invoice this receipt paid toward is listed too, even when it is now fully paid, so the parent can see what
   * the money went to. Void and draft invoices are never listed. The total counts EVERY open invoice, listed or not.
   */
  private async loadAccount(studentId: string, receiptId: string): Promise<ReceiptPdfAccount> {
    const [totals] = (await this.dataSource.query(
      `
      SELECT coalesce(sum(balance), 0)::text AS total_balance, count(*)::int AS open_count
        FROM app.bill_invoice
       WHERE student_id = $1::uuid AND status IN ('POSTED', 'PARTIALLY_PAID') AND balance > 0
      `,
      [studentId],
    )) as Array<{ total_balance: string; open_count: number }>;

    const invoices: Array<{ id: string; number: string; total: string; paid_amount: string; balance: string; term_name: string | null; year_name: string | null; by_receipt: string }> =
      await this.dataSource.query(
        `
        SELECT x.id, x.number, x.total, x.paid_amount, x.balance, x.term_name, x.year_name, x.by_receipt_amount::text AS by_receipt
          FROM (
            SELECT i.id, i.number, i.due_date, i.total::text AS total, i.paid_amount::text AS paid_amount, i.balance::text AS balance,
                   t.name AS term_name, y.name AS year_name,
                   (SELECT coalesce(sum(a.amount), 0) FROM app.pay_receipt_allocation a WHERE a.receipt_id = $2::uuid AND a.invoice_id = i.id) AS by_receipt_amount
              FROM app.bill_invoice i
              LEFT JOIN app.set_term t ON t.id = i.term_id
              LEFT JOIN app.set_academic_year y ON y.id = t.academic_year_id
             WHERE i.student_id = $1::uuid
               AND (
                     (i.status IN ('POSTED', 'PARTIALLY_PAID') AND i.balance > 0)
                  OR (i.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID')
                      AND EXISTS (SELECT 1 FROM app.pay_receipt_allocation a WHERE a.receipt_id = $2::uuid AND a.invoice_id = i.id))
                   )
          ) x
         ORDER BY (x.by_receipt_amount > 0) DESC, x.due_date ASC, x.number ASC
         LIMIT $3
        `,
        [studentId, receiptId, MAX_INVOICES_ON_RECEIPT],
      );

    const categories: Array<{ invoice_id: string; category: string; discount: string; net: string }> = invoices.length
      ? await this.dataSource.query(
          `
          SELECT l.invoice_id, c.name AS category, sum(l.concession_amount)::text AS discount, sum(l.amount - l.concession_amount)::text AS net
            FROM app.bill_invoice_line l
            JOIN app.bill_fee_category c ON c.id = l.fee_category_id
           WHERE l.invoice_id = ANY($1::uuid[])
           GROUP BY l.invoice_id, c.name
           ORDER BY l.invoice_id, min(l.line_no)
          `,
          [invoices.map((invoice) => invoice.id)],
        )
      : [];

    const listedOpen = invoices.filter((invoice) => Number(invoice.balance) > 0).length;
    return {
      totalBalance: totals?.total_balance ?? "0",
      moreInvoices: Math.max(0, (totals?.open_count ?? 0) - listedOpen),
      invoices: invoices.map((invoice) => ({
        number: invoice.number,
        termName: [invoice.year_name, invoice.term_name].filter(Boolean).join(" ") || null,
        total: invoice.total,
        paid: invoice.paid_amount,
        balance: invoice.balance,
        paidByThisReceipt: Number(invoice.by_receipt) > 0 ? invoice.by_receipt : null,
        categories: categories
          .filter((category) => category.invoice_id === invoice.id)
          .map((category) => ({ name: category.category, amount: category.net, discount: Number(category.discount) > 0 ? category.discount : null })),
      })),
    };
  }

  private async loadBranding(): Promise<ReceiptPdfBranding> {
    let theme;
    try {
      theme = await this.themesService.getCurrentTheme();
    } catch (error) {
      this.logger.warn(`Could not load the branding theme for a receipt - printing it unbranded: ${(error as Error).message}`);
      return { logo: null, headerText: null, footerText: null };
    }
    const documentConfig = theme.documentConfig ?? {};
    let logo: Buffer | null = null;
    if (theme.logoFileId) {
      try {
        logo = (await this.filesService.read(theme.logoFileId)).buffer;
      } catch (error) {
        this.logger.warn(`Could not read the branding logo for a receipt - omitting it: ${(error as Error).message}`);
      }
    }
    return { logo, headerText: clean(documentConfig.headerText), footerText: clean(documentConfig.footerText) };
  }

  /** The receipt's existing verification address, or null (no QR printed) when it has none. */
  private async loadVerification(receiptId: string, number: string): Promise<ReceiptPdfVerification | null> {
    try {
      const found = await this.documentVerification.findByDocument(PAYMENT_RECEIPT_DOCUMENT_TYPE, receiptId);
      if (!found) return null;
      const base = this.config.webAppUrl.replace(/\/+$/, "");
      return { url: `${base}/verify/${found.token}`, reference: number };
    } catch (error) {
      this.logger.warn(`Could not look up the verification token for receipt ${number} - printing without a QR code: ${(error as Error).message}`);
      return null;
    }
  }
}
