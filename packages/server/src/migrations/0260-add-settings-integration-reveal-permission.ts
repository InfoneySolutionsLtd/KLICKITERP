import { MigrationInterface, QueryRunner } from "typeorm";
import { generateUuidV7 } from "../shared/ids/uuid7";
import { PERMISSION_CATALOGUE } from "../platform/users/domain/permission-catalogue";

// Same "duplicate the two well-known, stable role display names as plain literals" choice
// `0230`/`0245`/`0246`/`0247`/`0248`/`0259` already made.
const SYSTEM_ADMIN_ROLE_NAME = "System Admin";
const AUDITOR_ROLE_NAME = "Auditor";

const NEW_PERMISSION_CODES = ["settings:integration:reveal"];

/**
 * 1 new permission code (`settings:integration:reveal` — read an integration's
 * saved credentials back in the clear so the Edit dialog can pre-fill them) —
 * mints it into `usr_permission` and grants it to `System Admin` only, NOT
 * `Auditor` (`isWrite: true` on purpose: BR-SEC-04 forbids auditor-class roles
 * from holding any write permission, and a permission that decrypts secrets
 * must never reach one — same `0900`/`0248`/`0259` rule). Existing roles that
 * already hold `settings:integration:manage` do NOT receive it automatically;
 * an admin grants it to them explicitly. Mirrors `0246`–`0259`'s standalone
 * "add permissions after `0900` already ran" precedent.
 */
export class AddSettingsIntegrationRevealPermission0260 implements MigrationInterface {
  name = "AddSettingsIntegrationRevealPermission1700000000260";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissionIds = new Map<string, string>();
    for (const code of NEW_PERMISSION_CODES) {
      const entry = PERMISSION_CATALOGUE.find((p) => p.code === code);
      if (!entry) {
        throw new Error(`AddSettingsIntegrationRevealPermission0260.up: "${code}" not found in PERMISSION_CATALOGUE`);
      }
      const rows: Array<{ id: string }> = await queryRunner.query(
        `
        INSERT INTO app.usr_permission (id, code, module, description, is_write)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code) DO UPDATE SET
          module = EXCLUDED.module,
          description = EXCLUDED.description,
          is_write = EXCLUDED.is_write
        RETURNING id
        `,
        [generateUuidV7(), entry.code, entry.module, entry.description, entry.isWrite],
      );
      permissionIds.set(entry.code, rows[0].id);
    }

    const roleRows: Array<{ id: string; name: string }> = await queryRunner.query(
      `SELECT id, name FROM app.usr_role WHERE name IN ($1, $2)`,
      [SYSTEM_ADMIN_ROLE_NAME, AUDITOR_ROLE_NAME],
    );
    for (const code of NEW_PERMISSION_CODES) {
      const entry = PERMISSION_CATALOGUE.find((p) => p.code === code)!;
      const permissionId = permissionIds.get(code)!;
      for (const role of roleRows) {
        if (role.name === AUDITOR_ROLE_NAME && entry.isWrite) continue;
        await queryRunner.query(
          `
          INSERT INTO app.usr_role_permission (id, role_id, permission_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (role_id, permission_id) DO NOTHING
          `,
          [generateUuidV7(), role.id, permissionId],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM app.usr_permission WHERE code = ANY($1::text[])`, [NEW_PERMISSION_CODES]);
  }
}
