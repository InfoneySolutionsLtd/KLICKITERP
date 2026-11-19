import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The notification bell grows from "two emitters, one list" into a catalogue of events the school can switch on and off and
 * each person can filter (FR-COMM-001 / FR-COMM-003).
 *
 * 1. `ntf_notification` gains `category` (the catalogue category of `type`, so "this category is off for me" is a plain
 *    filter) and `params` (the values the text is built from, so the reader sees it in their own language instead of the
 *    English sentence stored in `title`/`body`, which stays as the fallback). Existing rows are given their category; their
 *    `params` stay NULL and keep showing their stored text.
 * 2. `ntf_event_setting`: the school's choice per catalogue event (on/off, and the roles that receive it instead of the
 *    default permission holders). One row per event, created only when the school changes something: no row means defaults.
 * 3. `ntf_user_preference`: one person's on/off for one category in their own bell. No row means on.
 *
 * Additive. The two new tables follow the project's table conventions (uuid id, audit columns, `version`), and the
 * preference table's `user_id` is a foreign key `ON DELETE RESTRICT` like `ntf_notification`'s. No per-table `GRANT` needed
 * (`kfe_app` gets DML on every `app.*` table via migration `0002`'s default privileges).
 */
export class ExtendNotifications0271 implements MigrationInterface {
  name = "ExtendNotifications1700000000271";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.ntf_notification
        ADD COLUMN category varchar(30) NULL,
        ADD COLUMN params jsonb NULL
    `);
    await queryRunner.query(`UPDATE app.ntf_notification SET category = 'APPROVALS' WHERE type LIKE 'APPROVAL\\_%'`);
    await queryRunner.query(`UPDATE app.ntf_notification SET category = 'MONEY' WHERE type = 'PARENT_INVOICE_CREATED'`);

    await queryRunner.query(`
      CREATE TABLE app.ntf_event_setting (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        event_code varchar(60) NOT NULL,
        is_enabled boolean NOT NULL DEFAULT true,
        role_ids uuid[] NOT NULL DEFAULT '{}'
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_ntf_event_setting_event_code ON app.ntf_event_setting (event_code)`);

    await queryRunner.query(`
      CREATE TABLE app.ntf_user_preference (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        user_id uuid NOT NULL,
        category varchar(30) NOT NULL,
        is_enabled boolean NOT NULL DEFAULT true,
        CONSTRAINT fk_ntf_user_preference_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_ntf_user_preference_user_category ON app.ntf_user_preference (user_id, category)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.ntf_user_preference`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.ntf_event_setting`);
    await queryRunner.query(`
      ALTER TABLE app.ntf_notification
        DROP COLUMN IF EXISTS params,
        DROP COLUMN IF EXISTS category
    `);
  }
}
