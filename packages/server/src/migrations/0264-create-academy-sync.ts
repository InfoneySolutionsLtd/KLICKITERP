import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Academy student sync (docs: the Academy <-> ERP integration). Five additive tables, no change to any existing one:
 *
 * - `acad_sync_state`      singleton: first-import confirmation, auto-sync switch, incremental cursor
 * - `acad_student_map`     Academy student <-> `std_student`
 * - `acad_guardian_map`    Academy parent  <-> `std_guardian`
 * - `acad_class_map`       Academy level/stream <-> `std_class`/`std_stream`
 * - `acad_sync_run`        the preview/import log, with the issues a person has to look at
 *
 * Every FK to a core table is `ON DELETE RESTRICT` (this codebase's default): a student/guardian/class that sync
 * mapped cannot be deleted out from under the mapping. `uq_acad_sync_run_one_running` is the one-run-at-a-time guard.
 *
 * No per-table `GRANT` needed — `kfe_app` already gets full DML on every `app.*` table via migration `0002`'s
 * default-privileges rule (see `0256-create-ntf-notification.ts`).
 */
export class CreateAcademySync0264 implements MigrationInterface {
  name = "CreateAcademySync1700000000264";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const base = `
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        version int NOT NULL DEFAULT 1`;

    await queryRunner.query(`
      CREATE TABLE app.acad_sync_state (${base},
        singleton boolean NOT NULL DEFAULT true,
        first_import_confirmed_at timestamptz NULL,
        first_import_confirmed_by uuid NULL,
        auto_sync_enabled boolean NOT NULL DEFAULT false,
        last_success_at timestamptz NULL,
        last_full_success_at timestamptz NULL,
        last_updated_since varchar(40) NULL,
        CONSTRAINT ck_acad_sync_state_singleton CHECK (singleton)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_sync_state_singleton ON app.acad_sync_state (singleton)`);

    await queryRunner.query(`
      CREATE TABLE app.acad_student_map (${base},
        student_id uuid NOT NULL,
        academy_student_id varchar(64) NOT NULL,
        academy_admission_no varchar(30) NULL,
        academy_status varchar(15) NOT NULL,
        last_hash varchar(64) NOT NULL,
        last_seen_at timestamptz NOT NULL,
        removed_in_academy boolean NOT NULL DEFAULT false,
        linked_by varchar(15) NOT NULL,
        CONSTRAINT ck_acad_student_map_linked_by CHECK (linked_by IN ('CREATED','ADMISSION_NO')),
        CONSTRAINT fk_acad_student_map_student_id FOREIGN KEY (student_id)
          REFERENCES app.std_student(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_student_map_student ON app.acad_student_map (student_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_student_map_academy ON app.acad_student_map (academy_student_id)`);

    await queryRunner.query(`
      CREATE TABLE app.acad_guardian_map (${base},
        guardian_id uuid NOT NULL,
        academy_parent_id varchar(64) NOT NULL,
        last_seen_at timestamptz NOT NULL,
        CONSTRAINT fk_acad_guardian_map_guardian_id FOREIGN KEY (guardian_id)
          REFERENCES app.std_guardian(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_guardian_map_academy ON app.acad_guardian_map (academy_parent_id)`);
    await queryRunner.query(`CREATE INDEX ix_acad_guardian_map_guardian ON app.acad_guardian_map (guardian_id)`);

    await queryRunner.query(`
      CREATE TABLE app.acad_class_map (${base},
        kind varchar(10) NOT NULL,
        academy_id varchar(64) NOT NULL,
        academy_name varchar(120) NOT NULL,
        class_id uuid NOT NULL,
        stream_id uuid NULL,
        auto_created boolean NOT NULL DEFAULT false,
        CONSTRAINT ck_acad_class_map_kind CHECK (kind IN ('LEVEL','STREAM')),
        CONSTRAINT ck_acad_class_map_shape CHECK (
          (kind = 'LEVEL' AND stream_id IS NULL) OR (kind = 'STREAM' AND stream_id IS NOT NULL)
        ),
        CONSTRAINT fk_acad_class_map_class_id FOREIGN KEY (class_id)
          REFERENCES app.std_class(id) ON DELETE RESTRICT,
        CONSTRAINT fk_acad_class_map_stream_id FOREIGN KEY (stream_id)
          REFERENCES app.std_stream(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_class_map_academy ON app.acad_class_map (kind, academy_id)`);

    await queryRunner.query(`
      CREATE TABLE app.acad_sync_run (${base},
        mode varchar(10) NOT NULL,
        scope varchar(12) NOT NULL,
        trigger varchar(10) NOT NULL,
        status varchar(10) NOT NULL,
        started_at timestamptz NOT NULL,
        finished_at timestamptz NULL,
        requested_by uuid NULL,
        counts jsonb NOT NULL DEFAULT '{}'::jsonb,
        issues jsonb NOT NULL DEFAULT '[]'::jsonb,
        issues_total int NOT NULL DEFAULT 0,
        error text NULL,
        CONSTRAINT ck_acad_sync_run_mode CHECK (mode IN ('PREVIEW','IMPORT')),
        CONSTRAINT ck_acad_sync_run_scope CHECK (scope IN ('INCREMENTAL','FULL')),
        CONSTRAINT ck_acad_sync_run_trigger CHECK (trigger IN ('MANUAL','SCHEDULED')),
        CONSTRAINT ck_acad_sync_run_status CHECK (status IN ('RUNNING','SUCCEEDED','FAILED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX ix_acad_sync_run_started ON app.acad_sync_run (started_at)`);
    // At most one run in flight, across the API process and the worker.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_acad_sync_run_one_running ON app.acad_sync_run ((true)) WHERE status = 'RUNNING'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS app.acad_sync_run`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.acad_class_map`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.acad_guardian_map`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.acad_student_map`);
    await queryRunner.query(`DROP TABLE IF EXISTS app.acad_sync_state`);
  }
}
