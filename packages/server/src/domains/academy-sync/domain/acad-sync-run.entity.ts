import { Check, Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/** PREVIEW reads and reports only (nothing is written to the ERP); IMPORT applies the changes. */
export type AcadSyncMode = "PREVIEW" | "IMPORT";
export const ACAD_SYNC_MODES: readonly AcadSyncMode[] = ["PREVIEW", "IMPORT"];

/** INCREMENTAL asks for students changed since the last successful run; FULL reads everyone (and can spot who disappeared). */
export type AcadSyncScope = "INCREMENTAL" | "FULL";
export const ACAD_SYNC_SCOPES: readonly AcadSyncScope[] = ["INCREMENTAL", "FULL"];

export type AcadSyncTrigger = "MANUAL" | "SCHEDULED";
export const ACAD_SYNC_TRIGGERS: readonly AcadSyncTrigger[] = ["MANUAL", "SCHEDULED"];

export type AcadSyncStatus = "RUNNING" | "SUCCEEDED" | "FAILED";
export const ACAD_SYNC_STATUSES: readonly AcadSyncStatus[] = ["RUNNING", "SUCCEEDED", "FAILED"];

/** One thing a person has to look at. `code` is machine-readable; `message` is for the screen. */
export interface AcadSyncIssue {
  code: string;
  message: string;
  academyStudentId?: string;
  admissionNo?: string | null;
  studentName?: string;
}

/**
 * Maps to `acad_sync_run` — the log of every preview/import: what was asked for, what it did (`counts`), and what needs
 * a person (`issues`, capped; `issuesTotal` is the true number). The partial unique index `uq_acad_sync_run_one_running`
 * (migration `0264`, an expression index `TypeORM` cannot declare) lets at most ONE run be RUNNING at a time, which is
 * the cross-process guard against the worker and an admin both importing at once.
 */
@Entity("acad_sync_run")
@Index("ix_acad_sync_run_started", ["startedAt"])
@Check("ck_acad_sync_run_mode", `"mode" IN ('PREVIEW','IMPORT')`)
@Check("ck_acad_sync_run_scope", `"scope" IN ('INCREMENTAL','FULL')`)
@Check("ck_acad_sync_run_trigger", `"trigger" IN ('MANUAL','SCHEDULED')`)
@Check("ck_acad_sync_run_status", `"status" IN ('RUNNING','SUCCEEDED','FAILED')`)
export class AcadSyncRunEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 10, name: "mode" })
  mode!: AcadSyncMode;

  @Column({ type: "varchar", length: 12, name: "scope" })
  scope!: AcadSyncScope;

  @Column({ type: "varchar", length: 10, name: "trigger" })
  trigger!: AcadSyncTrigger;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: AcadSyncStatus;

  @Column({ type: "timestamptz", name: "started_at" })
  startedAt!: Date;

  @Column({ type: "timestamptz", name: "finished_at", nullable: true })
  finishedAt!: Date | null;

  @Column({ type: "uuid", name: "requested_by", nullable: true })
  requestedBy!: string | null;

  @Column({ type: "jsonb", name: "counts", default: {} })
  counts!: Record<string, number>;

  @Column({ type: "jsonb", name: "issues", default: [] })
  issues!: AcadSyncIssue[];

  @Column({ type: "int", name: "issues_total", default: 0 })
  issuesTotal!: number;

  /** Set when the run itself failed (the Academy was unreachable, the key was rejected, ...). */
  @Column({ type: "text", name: "error", nullable: true })
  error!: string | null;
}
