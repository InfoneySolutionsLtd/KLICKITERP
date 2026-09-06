import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A real, generic, per-user notification inbox — the bell icon in the
 * topbar was pure UI chrome until now (`NotificationBell`'s own doc
 * comment: "there is still no real signal to drive [an unread count]").
 * `platform/comms`'s `INAPP` channel/`comm_message` table were considered
 * and rejected as the backing store: `comm_message.recipient` is an
 * email/phone STRING with no per-user filter support anywhere, and that
 * table is documented as an append-only delivery-audit log, not a
 * read/unread inbox — a genuinely different concern.
 *
 * `type` is a plain `varchar` with deliberately NO CHECK constraint — the
 * actual extensibility mechanism: any future emitter (billing, procurement,
 * backups, ...) can introduce a brand-new `type` string with zero migration,
 * mirroring how `comm_message.entity_type`/`appr_instance.entity_type` are
 * already loose strings for the identical reason. `user_id` gets a REAL FK
 * (unlike `docv_record`'s deliberately-loose polymorphic document
 * reference) — a user is always the same, stable, known target, the same
 * one-directional `platform/users` exception `platform/auth`/`platform/
 * files`/`platform/comms`/`platform/approvals` already carry.
 * `version`/`ON DELETE RESTRICT` mirror `comm_device_token`'s own
 * precedent (`0045-create-comms-tables.ts`) — the closest existing
 * analogue (mutable, per-user, FK-to-usr_user).
 *
 * No per-table `GRANT` needed — `kfe_app` already gets full DML on every
 * `app.*` table via migration `0002`'s default-privileges rule (confirmed
 * by `0237-create-docv-record.ts`'s own doc comment).
 */
export class CreateNtfNotification0256 implements MigrationInterface {
  name = "CreateNtfNotification1700000000256";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.ntf_notification (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1,
        user_id uuid NOT NULL,
        type varchar(60) NOT NULL,
        title varchar(200) NOT NULL,
        body text NULL,
        link varchar(300) NULL,
        entity_type varchar(60) NULL,
        entity_id uuid NULL,
        read_at timestamptz NULL,
        CONSTRAINT fk_ntf_notification_user_id FOREIGN KEY (user_id)
          REFERENCES app.usr_user(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX ix_ntf_notification_user_unread ON app.ntf_notification (user_id) WHERE read_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_ntf_notification_user_created ON app.ntf_notification (user_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.ntf_notification`);
  }
}
