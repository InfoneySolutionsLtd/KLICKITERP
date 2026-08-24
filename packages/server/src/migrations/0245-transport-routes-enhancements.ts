import { MigrationInterface, QueryRunner } from "typeorm";
import { generateUuidV7 } from "../shared/ids/uuid7";
import { TRANSPORT_FEE_INCOME_CATEGORY_NAME } from "../domains/billing/application/transport-billing.service";
import { TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME } from "../domains/billing/application/transport-expense.service";
import { PERMISSION_CATALOGUE } from "../platform/users/domain/permission-catalogue";

// `0900-seed-permissions-and-roles.ts`'s own `SYSTEM_ADMIN_ROLE`/`AUDITOR_ROLE`
// consts are local (not exported) — same "duplicate the two well-known,
// stable role display names as plain literals" choice
// `0230-add-payments-receipt-view-all-permission.ts` already made for the
// identical reason (a later migration reaching into an earlier one's
// private constant is the wrong direction of dependency).
const SYSTEM_ADMIN_ROLE_NAME = "System Admin";
const AUDITOR_ROLE_NAME = "Auditor";

const NEW_PERMISSION_CODES = [
  "billing:transport-route:bill",
  "billing:transport-expense:view",
  "billing:transport-expense:manage",
];

/**
 * Transport Routes enhancement (2026-08-22) — three additions, all
 * additive, no existing table/column changed in a breaking way:
 *
 * 1. `bill_transport_route.bus` — an optional free-text vehicle identifier.
 * 2. `bill_transport_billing_line` — records which real `bill_invoice_line`
 *    rows a "Bill Transport" run created for a route (the income side of
 *    the route's own income-vs-expense summary). Deliberately a link table,
 *    not a new column on `bill_invoice_line` itself — that table is the
 *    shared core every billing flow in this codebase writes through
 *    (`InvoicingService.generateInvoice()`/`.postInvoice()`), so this stays
 *    fully isolated from shared invoicing internals.
 * 3. `bill_transport_expense` — links a real `exp_voucher` (fuel, repairs,
 *    etc.) to the route it was incurred for (the expense side), mirroring
 *    `fa_maintenance.cost_expense_voucher_id -> exp_voucher`'s own exact
 *    precedent in `domains/fixed-assets` — a bus expense IS an ordinary
 *    expense voucher, reusing `VouchersService`'s full lifecycle unchanged.
 *
 * Seeds two designated `bill_fee_category`/`exp_category` rows (idempotent
 * `INSERT ... ON CONFLICT (name) DO UPDATE`, mirroring `0900`'s own
 * `seedLateFeeIncomeCategory()`/`seedBounceFeeCategory()` pattern exactly —
 * this migration is deliberately its own file rather than an edit to
 * already-applied `0900`, since TypeORM tracks that migration as executed
 * and would never re-run an in-place edit to it):
 *  - `TRANSPORT_FEE_INCOME_CATEGORY_NAME` ("Transport Fee") — reuses the
 *    already-seeded `4030 Other Income` GL leaf, same judgement call
 *    `LateFeeBatchesService`/`ChequesService.bounce()` already made for
 *    their own designated categories (not enough reason yet to mint a
 *    dedicated income account for a category this narrow).
 *  - `TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME` ("Transport/Vehicle
 *    Expense") — genuinely NEW GL leaf `5140 Transport/Vehicle Expense`
 *    (confirmed via direct search: no existing `5xxx` leaf fits; `5120`/
 *    `5130` — Fixed Assets' own depreciation-expense pair — are the highest
 *    currently seeded, so `5140` is the next free code), since expenses
 *    have no equivalent "reuse a generic leaf" precedent the way `4030`
 *    serves every narrow income category.
 */
export class TransportRoutesEnhancements0245 implements MigrationInterface {
  name = "TransportRoutesEnhancements1700000000245";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.bill_transport_route ADD COLUMN bus varchar(80) NULL`);

    await queryRunner.query(`
      CREATE TABLE app.bill_transport_billing_line (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        route_id uuid NOT NULL,
        invoice_line_id uuid NOT NULL,
        student_id uuid NOT NULL,
        CONSTRAINT fk_bill_transport_billing_line_route_id FOREIGN KEY (route_id)
          REFERENCES app.bill_transport_route(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_transport_billing_line_invoice_line_id FOREIGN KEY (invoice_line_id)
          REFERENCES app.bill_invoice_line(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_transport_billing_line_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_bill_transport_billing_line_route_id ON app.bill_transport_billing_line(route_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE app.bill_transport_expense (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        route_id uuid NOT NULL,
        voucher_id uuid NOT NULL,
        CONSTRAINT fk_bill_transport_expense_route_id FOREIGN KEY (route_id)
          REFERENCES app.bill_transport_route(id) ON DELETE RESTRICT,
        CONSTRAINT fk_bill_transport_expense_voucher_id FOREIGN KEY (voucher_id)
          REFERENCES app.exp_voucher(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_bill_transport_expense_route_id ON app.bill_transport_expense(route_id)`);

    await this.seedTransportFeeIncomeCategory(queryRunner);
    await this.seedTransportVehicleExpenseAccount(queryRunner);
    await this.seedNewPermissions(queryRunner);
  }

  /**
   * `PERMISSION_CATALOGUE`'s 3 new codes for this feature — mints them into
   * `usr_permission` and grants them to the same two roles `0900`'s own
   * seeding loop grants every catalogue permission to (`System Admin`:
   * always; `Auditor`: only non-write), exactly mirroring `0230`'s own
   * standalone "add a permission after 0900 already ran" precedent (see
   * that migration's own doc comment for why this can't just be an edit to
   * `0900` in place).
   */
  private async seedNewPermissions(queryRunner: QueryRunner): Promise<void> {
    const permissionIds = new Map<string, string>();
    for (const code of NEW_PERMISSION_CODES) {
      const entry = PERMISSION_CATALOGUE.find((p) => p.code === code);
      if (!entry) {
        throw new Error(`TransportRoutesEnhancements0245.seedNewPermissions: "${code}" not found in PERMISSION_CATALOGUE`);
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

  private async seedTransportFeeIncomeCategory(queryRunner: QueryRunner): Promise<void> {
    const accountRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
      "4030",
    ]);
    if (accountRows.length === 0) {
      throw new Error(
        "TransportRoutesEnhancements0245.seedTransportFeeIncomeCategory: gl_account code=4030 (Other Income) not found",
      );
    }
    await queryRunner.query(
      `
      INSERT INTO app.bill_fee_category (id, name, gl_income_account_id, taxable, is_active, priority)
      VALUES ($1, $2, $3, false, true, 0)
      ON CONFLICT (name) DO UPDATE SET gl_income_account_id = EXCLUDED.gl_income_account_id, is_active = true
      `,
      [generateUuidV7(), TRANSPORT_FEE_INCOME_CATEGORY_NAME, accountRows[0].id],
    );
  }

  private async seedTransportVehicleExpenseAccount(queryRunner: QueryRunner): Promise<void> {
    const parentRows: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
      "5000",
    ]);
    if (parentRows.length === 0) {
      throw new Error("TransportRoutesEnhancements0245.seedTransportVehicleExpenseAccount: gl_account code=5000 (Expenses) not found");
    }
    const existing: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM app.gl_account WHERE code = $1`, [
      "5140",
    ]);
    const glExpenseAccountId =
      existing[0]?.id ??
      (
        await queryRunner.query(
          `
          INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, control_domain, is_active)
          VALUES ($1, '5140', 'Transport/Vehicle Expense', 'EXPENSE', $2, true, false, NULL, true)
          RETURNING id
          `,
          [generateUuidV7(), parentRows[0].id],
        )
      )[0].id;

    await queryRunner.query(
      `
      INSERT INTO app.exp_category (id, name, gl_expense_account_id, budget_required, is_active)
      VALUES ($1, $2, $3, false, true)
      ON CONFLICT (name) DO UPDATE SET gl_expense_account_id = EXCLUDED.gl_expense_account_id, is_active = true
      `,
      [generateUuidV7(), TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME, glExpenseAccountId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const code of NEW_PERMISSION_CODES) {
      const permissionRows: Array<{ id: string }> = await queryRunner.query(
        `SELECT id FROM app.usr_permission WHERE code = $1`,
        [code],
      );
      for (const permission of permissionRows) {
        await queryRunner.query(`DELETE FROM app.usr_role_permission WHERE permission_id = $1`, [permission.id]);
      }
      await queryRunner.query(`DELETE FROM app.usr_permission WHERE code = $1`, [code]);
    }
    await queryRunner.query(`DELETE FROM app.exp_category WHERE name = $1`, [TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME]);
    await queryRunner.query(`DELETE FROM app.gl_account WHERE code = '5140'`);
    await queryRunner.query(`DELETE FROM app.bill_fee_category WHERE name = $1`, [TRANSPORT_FEE_INCOME_CATEGORY_NAME]);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_transport_expense`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.bill_transport_billing_line`);
    await queryRunner.query(`ALTER TABLE app.bill_transport_route DROP COLUMN IF EXISTS bus`);
  }
}
