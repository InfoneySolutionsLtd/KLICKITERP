import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Publishing the ERP's invoices to the Academy parent portal (Academy <-> ERP integration, Phase B).
 *
 * - `acad_invoice_publication`: per invoice, the `bill_invoice.version` the Academy last accepted (see the entity).
 * - `acad_sync_state`: the admin's on/off switch for publishing (OFF by default — nothing leaves the ERP until a person
 *   turns it on) and the outcome of the last publishing run.
 *
 * Additive. `invoice_id` is a real FK, `ON DELETE RESTRICT` like every other link to `bill_invoice`. No per-table
 * `GRANT` needed (`kfe_app` gets DML on every `app.*` table via migration `0002`'s default privileges).
 */
export class CreateAcademyInvoicePublication0267 implements MigrationInterface {
  name = "CreateAcademyInvoicePublication1700000000267";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.acad_invoice_publication (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        invoice_id uuid NOT NULL,
        published_version int NULL,
        published_at timestamptz NULL,
        attempts int NOT NULL DEFAULT 0,
        last_attempt_at timestamptz NULL,
        last_error varchar(300) NULL,
        CONSTRAINT fk_acad_invoice_publication_invoice_id FOREIGN KEY (invoice_id)
          REFERENCES app.bill_invoice(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_invoice_publication_invoice ON app.acad_invoice_publication (invoice_id)`);

    await queryRunner.query(`
      ALTER TABLE app.acad_sync_state
        ADD COLUMN publish_invoices_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN last_publish_at timestamptz NULL,
        ADD COLUMN last_publish_ok boolean NULL,
        ADD COLUMN last_publish_message varchar(300) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.acad_sync_state
        DROP COLUMN IF EXISTS last_publish_message,
        DROP COLUMN IF EXISTS last_publish_ok,
        DROP COLUMN IF EXISTS last_publish_at,
        DROP COLUMN IF EXISTS publish_invoices_enabled
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS app.acad_invoice_publication`);
  }
}
