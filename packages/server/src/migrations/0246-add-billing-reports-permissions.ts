import { MigrationInterface, QueryRunner } from "typeorm";
import { generateUuidV7 } from "../shared/ids/uuid7";
import { PERMISSION_CATALOGUE } from "../platform/users/domain/permission-catalogue";

// `0900-seed-permissions-and-roles.ts`'s own `SYSTEM_ADMIN_ROLE`/`AUDITOR_ROLE`
// consts are local (not exported) — same "duplicate the two well-known,
// stable role display names as plain literals" choice `0230`/`0245` already
// made for the identical reason.
const SYSTEM_ADMIN_ROLE_NAME = "System Admin";
const AUDITOR_ROLE_NAME = "Auditor";

const NEW_PERMISSION_CODES = [
  "reports:invoice-balance-by-grade:view",
  "reports:siblings:view",
  "reports:term-wise-balance:view",
  "reports:vehicle-expense:view",
];

/**
 * 4 new report permission codes (Invoice Balance by Grade, Siblings,
 * Term-wise Balance, Vehicle Expense) — mints them into `usr_permission` and
 * grants them to the same two roles `0900`'s own seeding loop grants every
 * catalogue permission to (`System Admin`: always; `Auditor`: also, since
 * all 4 are `isWrite: false`), exactly mirroring `0245`'s own standalone
 * "add permissions after 0900 already ran" precedent — `PERMISSION_CATALOGUE`
 * is only synced into the live `usr_permission` table by a migration, never
 * read live at startup, so adding entries to that file alone has no effect
 * on an already-migrated database without this step.
 */
export class AddBillingReportsPermissions0246 implements MigrationInterface {
  name = "AddBillingReportsPermissions1700000000246";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissionIds = new Map<string, string>();
    for (const code of NEW_PERMISSION_CODES) {
      const entry = PERMISSION_CATALOGUE.find((p) => p.code === code);
      if (!entry) {
        throw new Error(`AddBillingReportsPermissions0246.up: "${code}" not found in PERMISSION_CATALOGUE`);
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
