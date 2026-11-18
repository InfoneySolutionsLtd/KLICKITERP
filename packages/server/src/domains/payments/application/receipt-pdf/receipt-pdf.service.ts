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
import { renderReceiptPdf, type ReceiptPdfBranding, type ReceiptPdfData, type ReceiptPdfVerification } from "./receipt-pdf.renderer";

interface ReceiptRow {
  id: string;
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
 * It deliberately does NOT print the receipt's `balance_after`: that is a running-ledger snapshot taken when the receipt was captured and
 * routinely differs from what the learner currently owes (which the portal's invoices show), so on a parent's proof of payment it would
 * only contradict the page beside it.
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
      SELECT r.id, r.number, to_char(r.receipt_date, 'YYYY-MM-DD') AS date, r.total::text AS total, r.status, r.payer_name,
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

    const [splits, allocations, branding, verification] = await Promise.all([
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
    };

    const buffer = await renderReceiptPdf({ receipt, branding, verification, generatedAt: new Date() });
    return { filename: `receipt-${row.number.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`, buffer };
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
