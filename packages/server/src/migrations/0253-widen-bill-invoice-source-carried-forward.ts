import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Bulk Billing "regenerate like previous term" feature (2026-09-04) — adds
 * `CARRIED_FORWARD` as a 5th `bill_invoice.source` value (see
 * `bill-invoice.entity.ts`'s own doc comment for the full design). `source`
 * was `varchar(12)` (migration 0070) — too narrow for `"CARRIED_FORWARD"`
 * (15 chars) — so this widens the column to `varchar(20)` before widening
 * the CHECK constraint itself.
 */
export class WidenBillInvoiceSourceCarriedForward0253 implements MigrationInterface {
  name = "WidenBillInvoiceSourceCarriedForward1700000000253";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.bill_invoice ALTER COLUMN source TYPE varchar(20)`);
    await queryRunner.query(`ALTER TABLE app.bill_invoice DROP CONSTRAINT ck_bill_invoice_source`);
    await queryRunner.query(`
      ALTER TABLE app.bill_invoice ADD CONSTRAINT ck_bill_invoice_source
        CHECK (source IN ('STRUCTURE','ADHOC','RECURRING','DEBIT_NOTE','CARRIED_FORWARD'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.bill_invoice DROP CONSTRAINT ck_bill_invoice_source`);
    await queryRunner.query(`
      ALTER TABLE app.bill_invoice ADD CONSTRAINT ck_bill_invoice_source
        CHECK (source IN ('STRUCTURE','ADHOC','RECURRING','DEBIT_NOTE'))
    `);
    await queryRunner.query(`ALTER TABLE app.bill_invoice ALTER COLUMN source TYPE varchar(12)`);
  }
}
