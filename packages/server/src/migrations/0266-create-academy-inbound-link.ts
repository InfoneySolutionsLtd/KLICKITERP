import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `acad_inbound_link` — the singleton holding the address the Academy calls this ERP on and the encrypted secret its
 * calls are signed with (Academy <-> ERP integration, Phase 0). See `AcadInboundLinkEntity`.
 *
 * Additive; no per-table `GRANT` needed — `kfe_app` gets full DML on every `app.*` table via migration `0002`'s
 * default-privileges rule.
 */
export class CreateAcademyInboundLink0266 implements MigrationInterface {
  name = "CreateAcademyInboundLink1700000000266";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.acad_inbound_link (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        singleton boolean NOT NULL DEFAULT true,
        registered_base_url varchar(500) NOT NULL,
        secret_enc bytea NOT NULL,
        secret_version int NOT NULL DEFAULT 1,
        registered_at timestamptz NOT NULL,
        registered_by uuid NULL,
        last_verified_at timestamptz NULL,
        last_verify_ok boolean NULL,
        last_verify_message varchar(300) NULL,
        last_inbound_at timestamptz NULL,
        CONSTRAINT ck_acad_inbound_link_singleton CHECK (singleton)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_inbound_link_singleton ON app.acad_inbound_link (singleton)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.acad_inbound_link`);
  }
}
