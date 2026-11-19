import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Parents customise and generate their own fee invoices from the Academy parent portal (Academy <-> ERP integration).
 *
 * 1. `acad_sync_state` gains the school's switch and its notification list:
 *    - `parent_invoicing_enabled` — OFF until an administrator switches it on (a parent only gets the option when it is on).
 *    - `parent_invoice_notify_role_ids` — the roles whose active users are told "a parent has created an invoice". Empty
 *      means "everyone who can post invoices".
 * 2. `acad_parent_invoice_request`: one row per "generate this invoice" the Academy asks for. The Academy names its own
 *    request id (`academy_request_id`, UNIQUE), which is what makes the call safe to repeat: a retry (a dropped connection,
 *    a double tap) finds the row and never creates a second invoice. The row is also the audit trail — who asked (the
 *    parent's name as the Academy verified it), for which learner and term, what they chose, and which invoices came of it.
 *
 * The invoices themselves are ordinary `bill_invoice` rows created through the existing billing engine; this table only
 * links the Academy's request to them (`fee_invoice_id` / `transport_invoice_id`).
 *
 * Additive. `student_id` is NULL when the Academy named a learner this ERP has not linked (the refusal is still recorded, so a
 * replay answers the same). `term_id` is deliberately a plain column with NO foreign key: it is what the Academy ASKED for,
 * recorded even when that term does not exist (a stale page or a tampered request), so the refusal can be recorded and a replay
 * answers the same instead of failing the insert. The links to learners and invoices are foreign keys `ON DELETE RESTRICT` like
 * every other link to those tables. No per-table `GRANT` needed (`kfe_app` gets DML on every `app.*` table via migration
 * `0002`'s default privileges).
 */
export class CreateAcademyParentInvoicing0270 implements MigrationInterface {
  name = "CreateAcademyParentInvoicing1700000000270";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.acad_sync_state
        ADD COLUMN parent_invoicing_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN parent_invoice_notify_role_ids uuid[] NOT NULL DEFAULT '{}'
    `);

    await queryRunner.query(`
      CREATE TABLE app.acad_parent_invoice_request (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        academy_request_id uuid NOT NULL,
        academy_student_id varchar(64) NOT NULL,
        student_id uuid NULL,
        term_id uuid NULL,
        parent_name varchar(200) NULL,
        selection jsonb NOT NULL,
        mode varchar(8) NULL,
        status varchar(10) NOT NULL,
        refusal_code varchar(30) NULL,
        refusal_message varchar(300) NULL,
        fee_invoice_id uuid NULL,
        transport_invoice_id uuid NULL,
        CONSTRAINT ck_acad_parent_invoice_request_status CHECK (status IN ('RECEIVED','CREATED','REFUSED')),
        CONSTRAINT ck_acad_parent_invoice_request_mode CHECK (mode IS NULL OR mode IN ('FULL','TOP_UP')),
        CONSTRAINT fk_acad_parent_invoice_request_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT,
        CONSTRAINT fk_acad_parent_invoice_request_fee_invoice_id FOREIGN KEY (fee_invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE RESTRICT,
        CONSTRAINT fk_acad_parent_invoice_request_transport_invoice_id FOREIGN KEY (transport_invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_parent_invoice_request_academy ON app.acad_parent_invoice_request (academy_request_id)`);
    await queryRunner.query(
      `CREATE INDEX ix_acad_parent_invoice_request_student ON app.acad_parent_invoice_request (student_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.acad_parent_invoice_request`);
    await queryRunner.query(`
      ALTER TABLE app.acad_sync_state
        DROP COLUMN IF EXISTS parent_invoice_notify_role_ids,
        DROP COLUMN IF EXISTS parent_invoicing_enabled
    `);
  }
}
