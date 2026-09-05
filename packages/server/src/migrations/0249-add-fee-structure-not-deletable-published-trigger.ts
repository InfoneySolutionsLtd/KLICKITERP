import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * BR-BILL-03 hardening (2026-09-04) — a real, confirmed gap: the existing
 * `trg_bill_structure_immutable` (migration `0070`) only fires on direct
 * `bill_fee_structure_line` UPDATE/DELETE, reading the PARENT's status via
 * `OLD.fee_structure_id`. When a `bill_fee_structure` row itself is deleted,
 * `ON DELETE CASCADE` removes the parent row FIRST, then cascades to its
 * lines — so by the time the line-level trigger fires, its own
 * `SELECT status FROM app.bill_fee_structure WHERE id = OLD.fee_structure_id`
 * finds nothing (the parent is already gone), `v_status` stays `NULL`, and
 * `IF v_status = 'PUBLISHED'` never fires. A `PUBLISHED`/`SUPERSEDED`
 * structure's lines were therefore never actually protected against a
 * cascade-triggered delete, only against a direct line-level UPDATE/DELETE.
 *
 * `FeeStructuresService.delete()` now blocks this at the application layer
 * (checks `status` before ever reaching the DB — see that method's own doc
 * comment) — this trigger is the DB-level backstop, added directly on
 * `bill_fee_structure` itself so it fires BEFORE any cascade to lines even
 * begins, the same two-layer "app check first, DB trigger as the real,
 * unbypassable enforcement" discipline this codebase uses everywhere else
 * (e.g. BR-FA-02's `fn_check_asset_not_disposed()`). A real product
 * decision, not a mechanical tightening: once published, a fee structure
 * can never be hard-deleted again — to remove a mistake, supersede it with
 * a new version instead (the existing `publish()` flow already does this).
 */
export class AddFeeStructureNotDeletablePublishedTrigger0249 implements MigrationInterface {
  name = "AddFeeStructureNotDeletablePublishedTrigger1700000000249";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION app.fn_bill_structure_not_deletable_published() RETURNS trigger AS $$
      BEGIN
        IF OLD.status IN ('PUBLISHED', 'SUPERSEDED') THEN
          RAISE EXCEPTION 'BR-BILL-03: fee structure % is % — a published fee structure can never be deleted, only superseded by publishing a new one',
            OLD.id, OLD.status
            USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_bill_structure_not_deletable_published
        BEFORE DELETE ON app.bill_fee_structure
        FOR EACH ROW EXECUTE FUNCTION app.fn_bill_structure_not_deletable_published()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_bill_structure_not_deletable_published ON app.bill_fee_structure`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS app.fn_bill_structure_not_deletable_published()`);
  }
}
