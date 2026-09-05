import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A real, live-confirmed gap found while finally getting `pg_dump` runnable
 * in this dev environment (Backups/Ops, Module 20) — `resolveAppDbConnectionConfig()`
 * (`backup-orchestrator.service.ts`) reuses the app's own `kfe_app` runtime
 * connection for `pg_dump`, and that same file's own doc comment asserts
 * "`pg_dump` only needs SELECT privileges, which the DML-only app role
 * already has" — that claim was WRONG, confirmed by a real `pg_dump` run
 * against the live dev database: `pg_dump` takes an `ACCESS SHARE` lock
 * (implies `SELECT`) on EVERY table in the target database up front, and
 * `kfe_app` was missing it on exactly 3 tables, none of them business/
 * financial data:
 *
 *  - `app.typeorm_migrations` / `app.typeorm_metadata` — owned by
 *    `kfe_migrate` (the superuser role migrations run as), never granted to
 *    `kfe_app` at all; pure schema-version bookkeeping, zero sensitivity.
 *  - `license.usage_snapshot` — migration `0239` deliberately granted
 *    `kfe_app` SELECT on `license.license`/`.api_call_log`/`.update_notice`
 *    for `LicenseStatusController`'s 3 staff-facing routes, but explicitly
 *    left `usage_snapshot` out ("no staff-facing route reads it" — true at
 *    the time, but a full-database `pg_dump` as `kfe_app` is a second real
 *    reader this table now has).
 *
 * Same narrow, read-only, least-privilege standard `0239` already
 * established — `kfe_app` gets no INSERT/UPDATE/DELETE on any of these 3
 * tables, only enough `SELECT` for `pg_dump` to complete a full logical
 * dump without a permission-denied abort partway through.
 */
export class GrantKfeAppBackupSelect0254 implements MigrationInterface {
  name = "GrantKfeAppBackupSelect1700000000254";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`GRANT SELECT ON app.typeorm_migrations TO kfe_app`);
    await queryRunner.query(`GRANT SELECT ON app.typeorm_metadata TO kfe_app`);
    await queryRunner.query(`GRANT SELECT ON license.usage_snapshot TO kfe_app`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`REVOKE SELECT ON license.usage_snapshot FROM kfe_app`);
    await queryRunner.query(`REVOKE SELECT ON app.typeorm_metadata FROM kfe_app`);
    await queryRunner.query(`REVOKE SELECT ON app.typeorm_migrations FROM kfe_app`);
  }
}
