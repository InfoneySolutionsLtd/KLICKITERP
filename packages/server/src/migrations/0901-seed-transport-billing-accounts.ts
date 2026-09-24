import { MigrationInterface, QueryRunner } from "typeorm";
import { generateUuidV7 } from "../shared/ids/uuid7";
import { TRANSPORT_FEE_INCOME_CATEGORY_NAME } from "../domains/billing/application/transport-billing.service";
import { TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME } from "../domains/billing/application/transport-expense.service";

/**
 * Seeds transport billing configuration after 0900 has created the chart of
 * accounts. Keeping this separate from the transport schema migration avoids
 * depending on seed data from a later migration.
 */
export class SeedTransportBillingAccounts0901 implements MigrationInterface {
  name = "SeedTransportBillingAccounts1700000000901";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const incomeRows: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM app.gl_account WHERE code = $1`,
      ["4030"],
    );
    if (incomeRows.length === 0) {
      throw new Error("SeedTransportBillingAccounts0901: gl_account code=4030 (Other Income) not found");
    }

    await queryRunner.query(
      `
      INSERT INTO app.bill_fee_category (id, name, gl_income_account_id, taxable, is_active, priority)
      VALUES ($1, $2, $3, false, true, 0)
      ON CONFLICT (name) DO UPDATE SET gl_income_account_id = EXCLUDED.gl_income_account_id, is_active = true
      `,
      [generateUuidV7(), TRANSPORT_FEE_INCOME_CATEGORY_NAME, incomeRows[0].id],
    );

    const expenseParentRows: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM app.gl_account WHERE code = $1`,
      ["5000"],
    );
    if (expenseParentRows.length === 0) {
      throw new Error("SeedTransportBillingAccounts0901: gl_account code=5000 (Expenses) not found");
    }

    const existingExpenseRows: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM app.gl_account WHERE code = $1`,
      ["5140"],
    );
    const expenseAccountId =
      existingExpenseRows[0]?.id ??
      (
        await queryRunner.query(
          `
          INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, control_domain, is_active)
          VALUES ($1, '5140', 'Transport/Vehicle Expense', 'EXPENSE', $2, true, false, NULL, true)
          RETURNING id
          `,
          [generateUuidV7(), expenseParentRows[0].id],
        )
      )[0].id;

    await queryRunner.query(
      `
      INSERT INTO app.exp_category (id, name, gl_expense_account_id, budget_required, is_active)
      VALUES ($1, $2, $3, false, true)
      ON CONFLICT (name) DO UPDATE SET gl_expense_account_id = EXCLUDED.gl_expense_account_id, is_active = true
      `,
      [generateUuidV7(), TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME, expenseAccountId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM app.exp_category WHERE name = $1`, [TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME]);
    await queryRunner.query(`DELETE FROM app.gl_account WHERE code = '5140'`);
    await queryRunner.query(`DELETE FROM app.bill_fee_category WHERE name = $1`, [TRANSPORT_FEE_INCOME_CATEGORY_NAME]);
  }
}
