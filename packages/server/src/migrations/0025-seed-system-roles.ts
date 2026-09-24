import { MigrationInterface, QueryRunner } from "typeorm";
import { generateUuidV7 } from "../shared/ids/uuid7";

/**
 * Seeds the two system role templates before feature migrations begin
 * granting permissions or creating role-based approval workflows.
 *
 * The complete permission catalogue is still seeded by migration 0900. This
 * migration only establishes the role rows because migrations 0230-0256
 * depend on them and are intentionally numbered before the broad 0900 seed.
 */
export class SeedSystemRoles0025 implements MigrationInterface {
  name = "SeedSystemRoles1700000000025";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO app.usr_role (id, name, description, is_system_template, is_auditor_class)
      VALUES
        ($1, 'System Admin', 'Full access to every permission', true, false),
        ($2, 'Auditor', 'Read-only access across all modules (BR-SEC-04)', true, true)
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description,
        is_system_template = EXCLUDED.is_system_template,
        is_auditor_class = EXCLUDED.is_auditor_class
      `,
      [generateUuidV7(), generateUuidV7()],
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // These are baseline system roles. They may already be referenced by
    // permissions, users, or approval workflows when later migrations run.
  }
}
