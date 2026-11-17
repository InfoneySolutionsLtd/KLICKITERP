import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `bank_external_transfer_dispatch` — one row per attempt to actually SEND an approved external bank transfer
 * through the bank's API (first provider: KCB BUNI Funds Transfer). See `BankExternalTransferDispatchEntity`.
 *
 * Two unique indexes carry the money-safety rules at the database level, so no code path can break them:
 *  - `uq_bank_ext_transfer_dispatch_ref` (provider, reference): the 12-character reference we give the bank is
 *    unique — it is the bank's idempotency handle;
 *  - `uq_bank_ext_transfer_dispatch_active` (transfer_id) WHERE status IN ('PENDING','SENT','UNKNOWN'): a transfer
 *    can have only ONE live attempt. A new attempt is possible only after the previous one is FAILED (the bank
 *    definitely did not pay) — never while one is in flight, already paid, or in an unknown state.
 *
 * No per-table `GRANT` needed — `kfe_app` already gets full DML on every `app.*` table via migration `0002`'s
 * default-privileges rule (see `0256-create-ntf-notification.ts`).
 */
export class CreateBankExternalTransferDispatch0262 implements MigrationInterface {
  name = "CreateBankExternalTransferDispatch1700000000262";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.bank_external_transfer_dispatch (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        transfer_id uuid NOT NULL,
        provider varchar(20) NOT NULL,
        reference varchar(12) NOT NULL,
        status varchar(10) NOT NULL,
        amount numeric(18,4) NOT NULL,
        request jsonb NOT NULL,
        response jsonb NULL,
        bank_ref varchar(60) NULL,
        note text NULL,
        CONSTRAINT ck_bank_ext_transfer_dispatch_provider CHECK (provider IN ('KCB')),
        CONSTRAINT ck_bank_ext_transfer_dispatch_status CHECK (status IN ('PENDING','SENT','FAILED','UNKNOWN')),
        CONSTRAINT ck_bank_ext_transfer_dispatch_amount_positive CHECK (amount > 0),
        CONSTRAINT fk_bank_ext_transfer_dispatch_transfer_id FOREIGN KEY (transfer_id)
          REFERENCES app.bank_external_transfer(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_bank_ext_transfer_dispatch_ref ON app.bank_external_transfer_dispatch (provider, reference)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_bank_ext_transfer_dispatch_active ON app.bank_external_transfer_dispatch (transfer_id) WHERE status IN ('PENDING','SENT','UNKNOWN')`,
    );
    await queryRunner.query(`CREATE INDEX ix_bank_ext_transfer_dispatch_transfer ON app.bank_external_transfer_dispatch (transfer_id, created_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.bank_external_transfer_dispatch`);
  }
}
