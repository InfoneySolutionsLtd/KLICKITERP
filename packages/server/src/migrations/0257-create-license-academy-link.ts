import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Academy Gateway integration — a new external system that now owns
 * subscription truth for this ERP (two-step school-code/OTP onboarding
 * yields a per-school API key; `GET /erp/entitlement` is then polled
 * periodically to drive `license.license.state`, see
 * `licensing/application/academy-entitlement.service.ts`). This table is
 * entirely SEPARATE from the pre-existing `license.license` row/file/JWS
 * channel — it just tracks Academy's own connection state, which one of
 * this module's services then uses to keep `license.license` in sync.
 *
 * Schema `license` (not `app`), same ownership regime as `license.license`/
 * `license.api_call_log`/etc. — no explicit `GRANT` needed, migration
 * `0002`'s `ALTER DEFAULT PRIVILEGES` rule for the `license` schema already
 * covers any new table `kfe_migrate` creates here, exactly like migration
 * `0190`'s 4 tables needed none. One row in practice (single-school
 * instance) — `AcademyLinkRepository.findCurrent()` reads the
 * most-recently-created row, the same "most recent wins" convention
 * `license.license`/`LicenseRepository.findCurrent()` already use.
 *
 * `pending_ref_id` is set by the "start onboarding" step and cleared by
 * "verify" — the OTP itself is NEVER persisted anywhere (nothing in either
 * gateway response is OTP-shaped, so there is nothing to accidentally
 * store). `api_key_id` is the `<key-id>` segment of `kfe_<key-id>_<secret>`,
 * kept in clear text purely for display/log-correlation (mirrors
 * `license.api_call_log.caller_key_id`'s identical shape for the OTHER
 * direction); `api_key_enc` is the full key, AES-256-GCM envelope-encrypted
 * via the existing `shared/crypto/aes-gcm.util.ts` helper (same convention
 * as 2FA secrets / `set_integration_config.config_enc`) — the raw secret is
 * never stored in the clear.
 *
 * `last_entitlement_checked_at` updates on every attempt (success or
 * failure); `last_entitlement_success_at`/`_allowed`/`_status`/`_expires_at`
 * update only on a successful call — the distinction
 * `AcademyEntitlementService`'s outage-grace-period logic needs (spec: "use
 * the last successful result only within a bounded grace period").
 */
export class CreateLicenseAcademyLink0257 implements MigrationInterface {
  name = "CreateLicenseAcademyLink1700000000257";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE license.academy_link (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        academy_school_id uuid NULL,
        academy_school_code varchar(40) NULL,
        pending_ref_id uuid NULL,
        api_key_id varchar(60) NULL,
        api_key_enc bytea NULL,
        last_entitlement_checked_at timestamptz NULL,
        last_entitlement_success_at timestamptz NULL,
        last_entitlement_allowed boolean NULL,
        last_entitlement_status varchar(20) NULL,
        last_entitlement_expires_at timestamptz NULL,
        last_entitlement_error varchar(500) NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_license_academy_link_created_at ON license.academy_link (created_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS license.academy_link`);
  }
}
