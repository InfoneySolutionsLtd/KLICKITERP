import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { DocumentVerificationService } from "../../../platform/document-verification";
import { runInTransaction } from "../../../shared/database/tx";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PAYMENT_RECEIPT_DOCUMENT_TYPE, receiptVerificationInput } from "./receipts.service";

/**
 * Makes sure a receipt has its verification token — the thing its QR code points at, and so what ties a printed or downloaded
 * copy back to this school's books.
 *
 * Every receipt issued now gets one when it is created (`ReceiptsService`). This is the backstop for any receipt that does not
 * have one yet (migration 0269 backfills the existing ones): it returns the token it has, or mints the missing one, so a
 * receipt is never printed without a QR code.
 *
 * Safe to call concurrently: two requests for the same receipt are serialised by a Postgres advisory lock, so a receipt can
 * never end up with two tokens. A reversal's contra-receipt (an accounting entry nobody is handed) is a not-found, as it is for
 * the PDF.
 */
@Injectable()
export class ReceiptVerificationService {
  private readonly logger = new Logger(ReceiptVerificationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly documentVerification: DocumentVerificationService,
  ) {}

  async ensureToken(receiptId: string): Promise<{ token: string }> {
    const existing = await this.documentVerification.findByDocument(PAYMENT_RECEIPT_DOCUMENT_TYPE, receiptId);
    if (existing) {
      return existing;
    }

    return runInTransaction(this.dataSource, async (em) => {
      await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`docv:${PAYMENT_RECEIPT_DOCUMENT_TYPE}:${receiptId}`]);
      // Looked up on a separate connection on purpose: after waiting for the lock it must see what the other request COMMITTED
      // (this transaction's own snapshot was taken before the wait).
      const raced = await this.documentVerification.findByDocument(PAYMENT_RECEIPT_DOCUMENT_TYPE, receiptId);
      if (raced) {
        return raced;
      }

      const rows: Array<{ id: string; number: string; payer_name: string; total: string; receipt_date: string; reversal_of_id: string | null }> = await em.query(
        `
        SELECT id, number, payer_name, total::text AS total, to_char(receipt_date, 'YYYY-MM-DD') AS receipt_date, reversal_of_id
          FROM app.pay_receipt
         WHERE id = $1::uuid
        `,
        [receiptId],
      );
      const row = rows[0];
      if (!row || row.reversal_of_id !== null) {
        throw new NotFoundException("PayReceipt", receiptId);
      }
      this.logger.log(`Receipt ${row.number} had no verification token: minting it now.`);
      return this.documentVerification.mint(
        em,
        receiptVerificationInput({ id: row.id, number: row.number, payerName: row.payer_name, total: row.total, receiptDate: row.receipt_date }),
      );
    });
  }
}
