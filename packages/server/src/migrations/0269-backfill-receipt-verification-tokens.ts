import { randomBytes } from "node:crypto";
import { MigrationInterface, QueryRunner } from "typeorm";
import { generateUuidV7 } from "../shared/ids/uuid7";

/**
 * Gives every existing receipt a verification token, so every receipt can carry the QR code that ties it to the school.
 *
 * Until now only receipts captured through `ReceiptsService.captureReceipt()` were given one; wallet- and credit-funded
 * receipts, and any receipt that predates the feature, were not, and so printed without a QR code. New receipts get theirs when
 * they are created (every path now mints). This is the one-off catch-up for the rest.
 *
 * Tokens are made exactly as `DocumentVerificationService.mint()` makes them (18 random bytes, base64url) and carry the same
 * summary, so the public verify page reads them identically. A reversal's contra-receipt (`reversal_of_id` set) is an accounting
 * entry nobody is handed and is skipped. Idempotent: a receipt that already has a token is left alone, so running it again
 * (or after `ReceiptVerificationService` has minted some on demand) changes nothing.
 *
 * `down()` does nothing on purpose: a token is a harmless, unguessable lookup key, minted tokens cannot be told apart from
 * those minted at creation, and removing one would break a QR code that may already have been printed.
 */
export class BackfillReceiptVerificationTokens0269 implements MigrationInterface {
  name = "BackfillReceiptVerificationTokens1700000000269";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const receipts: Array<{ id: string; number: string; payer_name: string; total: string; receipt_date: string }> = await queryRunner.query(`
      SELECT r.id, r.number, r.payer_name, r.total::text AS total, to_char(r.receipt_date, 'YYYY-MM-DD') AS receipt_date
        FROM app.pay_receipt r
       WHERE r.reversal_of_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM app.docv_record d WHERE d.document_type = 'PAYMENT_RECEIPT' AND d.document_id = r.id)
       ORDER BY r.created_at, r.id
    `);

    for (const receipt of receipts) {
      await queryRunner.query(
        `
        INSERT INTO app.docv_record (id, document_type, document_id, document_ref, token, summary)
        VALUES ($1::uuid, 'PAYMENT_RECEIPT', $2::uuid, $3, $4, $5::jsonb)
        `,
        [
          generateUuidV7(),
          receipt.id,
          receipt.number,
          randomBytes(18).toString("base64url"),
          JSON.stringify({ payerName: receipt.payer_name, total: receipt.total, receiptDate: receipt.receipt_date, receiptNumber: receipt.number }),
        ],
      );
    }
  }

  public async down(): Promise<void> {
    // Deliberately empty — see the class comment.
  }
}
