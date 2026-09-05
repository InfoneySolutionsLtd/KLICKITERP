import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P-35 (2026-09-04) — `bank_external_transfer`: a bank wire OUT to a
 * beneficiary the school does NOT own an account for. A deliberately
 * separate table from `bank_transfer` (BR-BANK-01's own inter-account
 * transfer, always between two owned `bank_account` rows) — see
 * `bank-external-transfer.entity.ts`'s own doc comment for the full
 * reasoning. No "distinct accounts" CHECK — there is no second owned-
 * account leg here.
 *
 * `debit_account_id` (FK `gl_account`) is the creator-picked "what this
 * payment is for" account — enforced as EXPENSE-class only by the frontend
 * picker, not a DB CHECK, mirroring `bill_concession_scheme.gl_account_id`'s
 * own precedent.
 */
export class CreateBankExternalTransferTable0251 implements MigrationInterface {
  name = "CreateBankExternalTransferTable1700000000251";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.bank_external_transfer (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        number varchar(30) NOT NULL,
        source_account_id uuid NOT NULL,
        beneficiary_name varchar(120) NOT NULL,
        beneficiary_bank_name varchar(120) NOT NULL,
        beneficiary_branch varchar(120) NULL,
        beneficiary_account_no varchar(40) NOT NULL,
        debit_account_id uuid NOT NULL,
        amount numeric(18,4) NOT NULL,
        status varchar(18) NOT NULL,
        approval_ref uuid NULL,
        journal_id uuid NULL,
        reference_no varchar(60) NULL,
        expected_clearing_date date NULL,
        fee_amount numeric(18,4) NULL,
        CONSTRAINT uq_bank_external_transfer_number UNIQUE (number),
        CONSTRAINT fk_bank_external_transfer_source_account_id FOREIGN KEY (source_account_id)
          REFERENCES app.bank_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_external_transfer_debit_account_id FOREIGN KEY (debit_account_id)
          REFERENCES app.gl_account(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bank_external_transfer_journal_id FOREIGN KEY (journal_id)
          REFERENCES app.gl_journal(id) ON DELETE RESTRICT,
        CONSTRAINT ck_bank_external_transfer_amount_positive CHECK (amount > 0),
        CONSTRAINT ck_bank_external_transfer_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')),
        CONSTRAINT ck_bank_external_transfer_fee_amount_nonneg CHECK (fee_amount IS NULL OR fee_amount >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_external_transfer`);
  }
}
