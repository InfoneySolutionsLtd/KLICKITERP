import { MigrationInterface, QueryRunner } from "typeorm";
import { generateUuidV7 } from "../shared/ids/uuid7";
import { PERMISSION_CATALOGUE } from "../platform/users/domain/permission-catalogue";

// Same "duplicate the two well-known, stable role display names as plain
// literals" choice `0230`/`0245`/`0246`/`0247` already made — see those
// migrations' own comments for why (`0900-seed-permissions-and-roles.ts`'s
// own `SYSTEM_ADMIN_ROLE`/`AUDITOR_ROLE` consts are local, not exported).
const SYSTEM_ADMIN_ROLE_NAME = "System Admin";
const AUDITOR_ROLE_NAME = "Auditor";

const NEW_PERMISSION_CODES = [
  "banking:external-transfer:create",
  "banking:external-transfer:decide",
  "banking:external-transfer:post",
];

const EXTERNAL_BANK_TRANSFERS_DOMAIN_CODE = "EXTERNAL_BANK_TRANSFERS";
const EXTERNAL_BANK_TRANSFERS_WORKFLOW_NAME = "External Bank Transfers";

/**
 * P-35 (External Bank Transfer feature) — two parts in one migration,
 * mirroring the established split conventions exactly:
 *
 * 1. Permissions — identical shape to `0247`: mint the 3 new codes into
 *    `usr_permission`, grant to System Admin always, Auditor never (all 3
 *    are `isWrite: true`, same as `banking:transfer:*`'s own grant shape).
 *
 * 2. Approval workflow seed — a standalone reproduction of `0900`'s own
 *    private `seedSingleLevelWorkflow()` SQL (that method isn't exported,
 *    so this migration inlines the same 3 idempotent upserts directly):
 *    one `appr_workflow_def` (upsert by `domain_code`), one
 *    `appr_workflow_version` (`version=1`, `is_current=true`), one
 *    `appr_level` (`seq=1`, `approver_type='ROLE'`, `mode='SEQUENTIAL'`,
 *    `quorum=1`, pointing at System Admin) — the same "amount-tiered chains
 *    start single-level, real tiers are future work" judgement call
 *    `BANK_TRANSFERS` itself already got.
 */
export class AddExternalBankTransferPermissionsAndWorkflow0252 implements MigrationInterface {
  name = "AddExternalBankTransferPermissionsAndWorkflow1700000000252";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissionIds = new Map<string, string>();
    for (const code of NEW_PERMISSION_CODES) {
      const entry = PERMISSION_CATALOGUE.find((p) => p.code === code);
      if (!entry) {
        throw new Error(`AddExternalBankTransferPermissionsAndWorkflow0252.up: "${code}" not found in PERMISSION_CATALOGUE`);
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

    const systemAdminRow = roleRows.find((r) => r.name === SYSTEM_ADMIN_ROLE_NAME);
    if (!systemAdminRow) {
      throw new Error(`AddExternalBankTransferPermissionsAndWorkflow0252.up: role "${SYSTEM_ADMIN_ROLE_NAME}" not found`);
    }
    const systemAdminRoleId = systemAdminRow.id;

    const defRows: Array<{ id: string }> = await queryRunner.query(
      `
      INSERT INTO app.appr_workflow_def (id, domain_code, name, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (domain_code) DO UPDATE SET name = EXCLUDED.name, is_active = true
      RETURNING id
      `,
      [generateUuidV7(), EXTERNAL_BANK_TRANSFERS_DOMAIN_CODE, EXTERNAL_BANK_TRANSFERS_WORKFLOW_NAME],
    );
    const workflowDefId = defRows[0].id;

    const versionRows: Array<{ id: string }> = await queryRunner.query(
      `
      INSERT INTO app.appr_workflow_version (id, workflow_def_id, "version", is_current)
      VALUES ($1, $2, 1, true)
      ON CONFLICT (workflow_def_id, "version") DO UPDATE SET is_current = true
      RETURNING id
      `,
      [generateUuidV7(), workflowDefId],
    );
    const workflowVersionId = versionRows[0].id;

    await queryRunner.query(
      `
      INSERT INTO app.appr_level (id, workflow_version_id, seq, approver_type, role_id, mode, quorum)
      VALUES ($1, $2, 1, 'ROLE', $3, 'SEQUENTIAL', 1)
      ON CONFLICT (workflow_version_id, seq) DO UPDATE SET
        approver_type = EXCLUDED.approver_type,
        role_id = EXCLUDED.role_id,
        mode = EXCLUDED.mode,
        quorum = EXCLUDED.quorum
      `,
      [generateUuidV7(), workflowVersionId, systemAdminRoleId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM app.usr_permission WHERE code = ANY($1::text[])`, [NEW_PERMISSION_CODES]);
    // `appr_workflow_version`/`appr_level` both FK back with ON DELETE
    // RESTRICT (migration `0050`) — child rows must go first.
    await queryRunner.query(
      `
      DELETE FROM app.appr_level WHERE workflow_version_id IN (
        SELECT wv.id FROM app.appr_workflow_version wv
        JOIN app.appr_workflow_def wd ON wd.id = wv.workflow_def_id
        WHERE wd.domain_code = $1
      )
      `,
      [EXTERNAL_BANK_TRANSFERS_DOMAIN_CODE],
    );
    await queryRunner.query(
      `
      DELETE FROM app.appr_workflow_version WHERE workflow_def_id IN (
        SELECT id FROM app.appr_workflow_def WHERE domain_code = $1
      )
      `,
      [EXTERNAL_BANK_TRANSFERS_DOMAIN_CODE],
    );
    await queryRunner.query(`DELETE FROM app.appr_workflow_def WHERE domain_code = $1`, [EXTERNAL_BANK_TRANSFERS_DOMAIN_CODE]);
  }
}
