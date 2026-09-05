import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Banking "real wire details" pass (2026-09-04) — adds three nullable
 * columns to `bank_transfer` so an inter-account transfer can carry the
 * detail a real bank wire actually has: `reference_no` (the bank's own
 * transaction reference, often only known after the transfer clears —
 * patchable at any status via `BankTransfersService.updateReferenceNo()`),
 * `expected_clearing_date` (informational only, no automation reads it),
 * and `fee_amount` (participates in P-32 posting when set — see
 * `bank-transfers.service.ts`'s `post()`).
 */
export class AddBankTransferWireDetails0250 implements MigrationInterface {
  name = "AddBankTransferWireDetails1700000000250";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.bank_transfer
        ADD COLUMN reference_no varchar(60) NULL,
        ADD COLUMN expected_clearing_date date NULL,
        ADD COLUMN fee_amount numeric(18,4) NULL,
        ADD CONSTRAINT ck_bank_transfer_fee_amount_nonneg CHECK (fee_amount IS NULL OR fee_amount >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.bank_transfer
        DROP CONSTRAINT ck_bank_transfer_fee_amount_nonneg,
        DROP COLUMN fee_amount,
        DROP COLUMN expected_clearing_date,
        DROP COLUMN reference_no
    `);
  }
}
