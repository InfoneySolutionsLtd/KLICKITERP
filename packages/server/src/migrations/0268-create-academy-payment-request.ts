import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Paying school fees from the Academy parent portal (Academy <-> ERP integration, Phase C).
 *
 * `acad_payment_request`: one row per "please send this parent an M-Pesa prompt" the Academy asks for. The Academy names
 * its own request id (`academy_request_id`, UNIQUE), which is what makes the call safe to repeat: a retry finds the row
 * and never sends a second prompt. The money itself is NOT recorded here — the STK push, its callback and the receipt
 * are the existing `pay_mpesa_transaction` / `pay_receipt` flow; this table only links the Academy's request to them
 * (`mpesa_transaction_id`) and remembers why a request was turned down.
 *
 * Additive. `student_id` is NULL when the Academy named a student this ERP does not know (the refusal is still recorded,
 * so a replay answers the same). Foreign keys are `ON DELETE RESTRICT` like every other link to those tables. No per-table
 * `GRANT` needed (`kfe_app` gets DML on every `app.*` table via migration `0002`'s default privileges).
 */
export class CreateAcademyPaymentRequest0268 implements MigrationInterface {
  name = "CreateAcademyPaymentRequest1700000000268";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.acad_payment_request (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        academy_request_id uuid NOT NULL,
        academy_student_id varchar(64) NOT NULL,
        student_id uuid NULL,
        amount numeric(18,4) NOT NULL,
        msisdn_masked varchar(20) NOT NULL,
        invoice_ids jsonb NULL,
        status varchar(10) NOT NULL,
        refusal_code varchar(30) NULL,
        refusal_message varchar(300) NULL,
        mpesa_transaction_id uuid NULL,
        CONSTRAINT ck_acad_payment_request_status CHECK (status IN ('RECEIVED','SENT','REFUSED')),
        CONSTRAINT fk_acad_payment_request_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_acad_payment_request_mpesa_transaction_id FOREIGN KEY (mpesa_transaction_id)
          REFERENCES app.pay_mpesa_transaction(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_payment_request_academy ON app.acad_payment_request (academy_request_id)`);
    await queryRunner.query(`CREATE INDEX ix_acad_payment_request_student ON app.acad_payment_request (student_id, created_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.acad_payment_request`);
  }
}
