import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A real, live-confirmed gap found while verifying migration `0257` against
 * the actual dev database — the exact same class of bug migration `0239`'s
 * own doc comment already documented once for this schema: `kfe_app` (the
 * ONLY role this codebase's single TypeORM connection actually uses, per
 * `0190`'s own "no separate kfe_app/kfe_license connection pools exist
 * anywhere in the code" note) had ZERO grants on the brand-new
 * `license.academy_link` table — confirmed with a real `permission denied
 * for table academy_link` from a direct `psql -U kfe_app` session, not a
 * hypothetical.
 *
 * This is NOT the same shape as `0239`'s fix, though: `0239` only needed
 * `SELECT`, because `license.license`/`api_call_log`/`update_notice`'s
 * MUTATION surface is the mutual-auth `/license/v1/*` channel
 * (`LicenseApiController`), which that migration's own doc comment notes is
 * "confirmed unreachable for a separate, already-documented reason" in this
 * environment — so `kfe_app` never actually needed write access there.
 * `license.academy_link`'s mutation surface is the OPPOSITE: it is written
 * by `AcademyOnboardingService`/`AcademyEntitlementService`, both reached
 * exclusively through the normal, live, `kfe_app`-connected request
 * pipeline (`AcademyIntegrationController`'s staff-facing routes, and
 * `apps/worker`'s own periodic BullMQ job) — there is no separate
 * `kfe_license`-reliant path for this table at all. `kfe_app` genuinely
 * needs real `INSERT`/`UPDATE` here, not just `SELECT`.
 *
 * `AcademyEntitlementService.syncLicenseState()` also calls
 * `LicenseRepository.create()`/`.save()` on `license.license` itself (to
 * activate/suspend/expire the singular row from the SAME `kfe_app`
 * connection) — `0239` only ever granted that table `SELECT`. Extending it
 * with `INSERT`/`UPDATE` here is the smallest correct fix: `kfe_app` still
 * gets no `DELETE` on either table (nothing in this codebase ever deletes a
 * `license.license` or `license.academy_link` row), and the mutual-auth
 * channel's own `kfe_license` grants (migration `0190`) are untouched.
 */
export class GrantKfeAppAcademyLinkDml0258 implements MigrationInterface {
  name = "GrantKfeAppAcademyLinkDml1700000000258";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`GRANT SELECT, INSERT, UPDATE ON license.academy_link TO kfe_app`);
    await queryRunner.query(`GRANT INSERT, UPDATE ON license.license TO kfe_app`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`REVOKE INSERT, UPDATE ON license.license FROM kfe_app`);
    await queryRunner.query(`REVOKE SELECT, INSERT, UPDATE ON license.academy_link FROM kfe_app`);
  }
}
