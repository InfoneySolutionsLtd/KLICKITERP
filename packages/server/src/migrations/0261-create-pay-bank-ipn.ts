import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `pay_bank_ipn` — the permanent, idempotent log of payment notifications a bank pushes to the ERP (first
 * consumer: KCB BUNI's Instant Payment Notification API). See `PayBankIpnEntity`'s doc comment for the design.
 *
 * `receipt_id` / `suspense_item_id` are real FKs (`ON DELETE RESTRICT`, like every other pay_* link): a notification
 * that produced a receipt or a suspense item can never be orphaned from it.
 *
 * No per-table `GRANT` needed — `kfe_app` already gets full DML on every `app.*` table via migration `0002`'s
 * default-privileges rule (see `0256-create-ntf-notification.ts`).
 */
export class CreatePayBankIpn0261 implements MigrationInterface {
  name = "CreatePayBankIpn1700000000261";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.pay_bank_ipn (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        provider varchar(20) NOT NULL,
        kind varchar(10) NOT NULL,
        external_ref varchar(60) NOT NULL,
        amount numeric(18,4) NOT NULL,
        currency varchar(3) NOT NULL,
        customer_reference varchar(100) NULL,
        payer_name varchar(150) NULL,
        payer_msisdn_masked varchar(20) NULL,
        narration varchar(255) NULL,
        credit_account varchar(40) NULL,
        till_number varchar(40) NULL,
        transaction_at timestamptz NOT NULL,
        state varchar(10) NOT NULL,
        receipt_id uuid NULL,
        suspense_item_id uuid NULL,
        note text NULL,
        raw jsonb NOT NULL,
        CONSTRAINT ck_pay_bank_ipn_provider CHECK (provider IN ('KCB')),
        CONSTRAINT ck_pay_bank_ipn_kind CHECK (kind IN ('ACCOUNT','TILL')),
        CONSTRAINT ck_pay_bank_ipn_state CHECK (state IN ('RECEIVED','MATCHED','SUSPENDED')),
        CONSTRAINT ck_pay_bank_ipn_amount_positive CHECK (amount > 0),
        CONSTRAINT fk_pay_bank_ipn_receipt_id FOREIGN KEY (receipt_id)
          REFERENCES app.pay_receipt(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pay_bank_ipn_suspense_item_id FOREIGN KEY (suspense_item_id)
          REFERENCES app.pay_suspense_item(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_pay_bank_ipn_ref ON app.pay_bank_ipn (provider, kind, external_ref)`);
    await queryRunner.query(`CREATE INDEX ix_pay_bank_ipn_created ON app.pay_bank_ipn (created_at)`);
    await queryRunner.query(`CREATE INDEX ix_pay_bank_ipn_state_p ON app.pay_bank_ipn (created_at) WHERE state <> 'MATCHED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.pay_bank_ipn`);
  }
}
