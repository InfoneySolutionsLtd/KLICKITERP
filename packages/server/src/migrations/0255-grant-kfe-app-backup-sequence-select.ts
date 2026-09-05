import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Follow-up to `0254` (same "make `pg_dump` runnable as `kfe_app`" gap) — a
 * GRANT on a table does NOT implicitly cover that table's own owned
 * sequence in Postgres; `pg_dump` separately reads a sequence's
 * `last_value`/`is_called` to reproduce it, and `kfe_app` was still missing
 * `SELECT` specifically on `app.typeorm_migrations_id_seq` (the auto-
 * increment sequence backing `typeorm_migrations.id`) even after `0254`
 * granted the table itself. Found live, immediately after `0254`, by
 * re-running the same real `pg_dump` attempt — confirmed via
 * `pg_sequences`/`has_sequence_privilege()` that this is the ONLY sequence
 * across `app`/`audit`/`license` still missing `SELECT` for `kfe_app`
 * (`typeorm_metadata`/`license.usage_snapshot` have no owned sequences of
 * their own).
 */
export class GrantKfeAppBackupSequenceSelect0255 implements MigrationInterface {
  name = "GrantKfeAppBackupSequenceSelect1700000000255";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`GRANT SELECT ON app.typeorm_migrations_id_seq TO kfe_app`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`REVOKE SELECT ON app.typeorm_migrations_id_seq FROM kfe_app`);
  }
}
