import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { NOTIFICATION_SINK, type NotificationSink } from "../../../shared/notifications/notification-sink.port";
import { ACADEMY_LINK_PORT } from "../../../shared/integrations/academy/academy-link.port";
import type { AcademyConnection, AcademyLinkPort } from "../../../shared/integrations/academy/academy-link.port";
import {
  ClassesService,
  GuardiansService,
  StdClassEntity,
  StdClassRepository,
  StdStreamRepository,
  StdStudentRepository,
  StreamsService,
  StudentsService,
} from "../../students";
import { AcadStudentMapEntity } from "../domain/acad-student-map.entity";
import { AcadSyncIssue, AcadSyncMode, AcadSyncRunEntity, AcadSyncScope, AcadSyncTrigger } from "../domain/acad-sync-run.entity";
import { AcadSyncStateEntity } from "../domain/acad-sync-state.entity";
import { AcadClassMapRepository } from "../infrastructure/acad-class-map.repository";
import { AcadGuardianMapRepository } from "../infrastructure/acad-guardian-map.repository";
import { AcadStudentMapRepository } from "../infrastructure/acad-student-map.repository";
import { AcadSyncRunRepository } from "../infrastructure/acad-sync-run.repository";
import { AcadSyncStateRepository } from "../infrastructure/acad-sync-state.repository";
import { AcademySyncClient } from "../infrastructure/academy-sync.client";
import { AcademyParentDto, AcademyStudentDto } from "./academy-sync.types";
import { fingerprintStudent, laterOf, levelNumberFromName, normalizePhone, splitFullName } from "./academy-sync.util";

const PAGE_SIZE = 200;
/** A run still RUNNING after this long was lost to a crash/restart and stops blocking new runs. */
const STALE_RUN_AFTER_MS = 30 * 60 * 1000;
/** Issues kept on the run row; `issuesTotal` always carries the true count. */
const MAX_STORED_ISSUES = 500;
/** A scheduled run does a FULL pass at least this often (it is the only way to notice who disappeared). */
const FULL_SYNC_EVERY_MS = 24 * 60 * 60 * 1000;
const PG_UNIQUE_VIOLATION = "23505";
/** Stored as a mapping's fingerprint until its guardians are synced — it is not a valid SHA-256 hex, so it never equals a real one. */
const PENDING_HASH = "pending";

export interface StartRunOptions {
  mode: AcadSyncMode;
  scope: AcadSyncScope;
  trigger: AcadSyncTrigger;
  actorId: string | null;
  /** The admin has looked at the preview and agrees to the first import. Required once, before anything is created. */
  confirmFirstImport?: boolean;
}

export interface StartedRun {
  run: AcadSyncRunEntity;
  /** Settles when the run has finished (the controller ignores it; the worker awaits it). Never rejects. */
  done: Promise<AcadSyncRunEntity>;
}

interface ResolvedClass {
  classId: string | null;
  streamId: string | null;
}

interface RunContext {
  dryRun: boolean;
  actorId: string | null;
  today: string;
  counts: Record<string, number>;
  issues: AcadSyncIssue[];
  issuesTotal: number;
  /** admission number -> Academy student that claimed it earlier in this run (catches two Academy students sharing one). */
  claimedAdmissionNos: Map<string, string>;
  seenAcademyIds: Set<string>;
  maxUpdatedAt: string | null;
  erpClasses: StdClassEntity[] | null;
  levelCache: Map<string, ResolvedClass & { name: string }>;
  streamCache: Map<string, ResolvedClass>;
  plannedClasses: Set<string>;
  plannedStreams: Set<string>;
}

const ZERO_COUNTS = [
  "seen",
  "created",
  "linked",
  "updated",
  "unchanged",
  "skipped",
  "removed",
  "missing",
  "guardiansCreated",
  "guardiansAdopted",
  "guardiansLinked",
  "classesCreated",
  "streamsCreated",
  "classesMapped",
  "streamsMapped",
  "errors",
] as const;

/**
 * Pulls the school's students and parents from the Klickit Academy into the ERP.
 *
 * The Academy is the source of truth for WHO the students are; the ERP stays the source of truth for everything
 * financial. So sync creates students, adopts ones that already exist (matched by admission number), keeps names up to
 * date and links guardians — and deliberately does NOT: change an admission number (it is the key receipts and bank
 * matching run on), move a student to another class (billing depends on it), flip a student to ALUMNI/TRANSFERRED/
 * WITHDRAWN (the ERP's exit-clearance rule needs a balance decision), or delete anything. Those differences are
 * reported as issues for a person.
 *
 * Safety rails, in order of importance:
 *  1. Nothing is created until an admin has run a PREVIEW and confirmed the first import.
 *  2. A student with no admission number, a one-word name, or an admission number that clashes with another student is
 *     skipped and listed — never given an invented value.
 *  3. Every step is idempotent (keyed by the Academy's ids, with a fingerprint per student), so a crashed or repeated
 *     run is harmless; one student failing never stops the rest.
 *  4. One run at a time, across the API and the worker (`uq_acad_sync_run_one_running`).
 */
@Injectable()
export class AcademySyncService {
  private readonly logger = new Logger(AcademySyncService.name);

  constructor(
    @Inject(ACADEMY_LINK_PORT) private readonly academyLink: AcademyLinkPort,
    private readonly client: AcademySyncClient,
    private readonly studentsService: StudentsService,
    private readonly studentRepository: StdStudentRepository,
    private readonly classesService: ClassesService,
    private readonly classRepository: StdClassRepository,
    private readonly streamsService: StreamsService,
    private readonly streamRepository: StdStreamRepository,
    private readonly guardiansService: GuardiansService,
    private readonly runRepository: AcadSyncRunRepository,
    private readonly stateRepository: AcadSyncStateRepository,
    private readonly studentMapRepository: AcadStudentMapRepository,
    private readonly guardianMapRepository: AcadGuardianMapRepository,
    private readonly classMapRepository: AcadClassMapRepository,
    /** Tells the people who manage the Academy link when publishing or syncing starts failing (the bell). */
    @Optional() @Inject(NOTIFICATION_SINK) private readonly notifications?: NotificationSink,
  ) {}

  // ---------------------------------------------------------------------------------------------------------------
  // Status + log
  // ---------------------------------------------------------------------------------------------------------------

  async getStatus(): Promise<{
    connected: boolean;
    academySchoolCode: string | null;
    state: AcadSyncStateEntity;
    mappedStudents: number;
    runningRun: AcadSyncRunEntity | null;
    lastPreview: AcadSyncRunEntity | null;
    lastImport: AcadSyncRunEntity | null;
  }> {
    const [connection, state, mappedStudents, runningRun, lastPreview, lastImport] = await Promise.all([
      this.academyLink.getConnection(),
      this.stateRepository.getOrCreate(),
      this.studentMapRepository.count(),
      this.runRepository.findRunning(),
      this.runRepository.findLastSucceeded("PREVIEW"),
      this.runRepository.findLastSucceeded("IMPORT"),
    ]);
    return {
      connected: connection !== null,
      academySchoolCode: connection?.academySchoolCode ?? null,
      state,
      mappedStudents,
      runningRun,
      lastPreview,
      lastImport,
    };
  }

  async listRuns(limit = 20): Promise<AcadSyncRunEntity[]> {
    return this.runRepository.listRecent(Math.min(Math.max(limit, 1), 100));
  }

  async getRun(id: string): Promise<AcadSyncRunEntity | null> {
    return this.runRepository.findById(id);
  }

  async setAutoSync(enabled: boolean, actorId: string | null): Promise<AcadSyncStateEntity> {
    const state = await this.stateRepository.getOrCreate();
    if (enabled && !state.firstImportConfirmedAt) {
      throw new ValidationException("Run and confirm the first import before switching automatic sync on.");
    }
    state.autoSyncEnabled = enabled;
    state.updatedBy = actorId;
    return this.stateRepository.save(state);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Starting runs
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Validates, records a RUNNING row, and starts the work. Returns as soon as the row exists; `done` settles when the
   * run has finished. Throws if the school is not linked to the Academy, a run is already going, or the first-import
   * rules are not met.
   */
  async startRun(options: StartRunOptions): Promise<StartedRun> {
    const connection = await this.academyLink.getConnection();
    if (!connection) {
      throw new ValidationException("This ERP is not connected to a Klickit Academy school yet. Connect it on the Licence page first.");
    }

    const state = await this.stateRepository.getOrCreate();
    let scope = options.scope;

    if (options.mode === "IMPORT" && !state.firstImportConfirmedAt) {
      if (options.trigger === "SCHEDULED") {
        throw new ValidationException("The first import has not been confirmed yet.");
      }
      if (!options.confirmFirstImport) {
        throw new ValidationException("Review the preview and confirm the first import before importing.");
      }
      if (!(await this.runRepository.findLastSucceeded("PREVIEW"))) {
        throw new ValidationException("Run a preview first, so you can see what the import will do.");
      }
      // The first import must see everyone, whatever was asked for.
      scope = "FULL";
    }
    if (options.mode === "PREVIEW") {
      // A preview that only looked at recent changes would not show what the first import will do.
      scope = state.firstImportConfirmedAt ? scope : "FULL";
    }

    await this.runRepository.failStale(new Date(Date.now() - STALE_RUN_AFTER_MS));

    let run: AcadSyncRunEntity;
    try {
      run = await this.runRepository.create({
        mode: options.mode,
        scope,
        trigger: options.trigger,
        status: "RUNNING",
        startedAt: new Date(),
        finishedAt: null,
        requestedBy: options.actorId,
        counts: {},
        issues: [],
        issuesTotal: 0,
        error: null,
        createdBy: options.actorId,
        updatedBy: options.actorId,
      });
    } catch (error) {
      if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION || (error as { driverError?: { code?: string } }).driverError?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException("An Academy sync is already running. Wait for it to finish.");
      }
      throw error;
    }

    const done = this.execute(run, { ...options, scope }, connection, state);
    return { run, done };
  }

  /**
   * The worker's entry point. Returns `null` when there is nothing to do (not linked, never confirmed, or automatic
   * sync is off); otherwise runs to completion. Does a FULL pass at least once a day, INCREMENTAL otherwise.
   */
  async runScheduled(): Promise<AcadSyncRunEntity | null> {
    const connection = await this.academyLink.getConnection();
    const state = await this.stateRepository.getOrCreate();
    if (!connection || !state.firstImportConfirmedAt || !state.autoSyncEnabled) {
      return null;
    }
    const fullDue = !state.lastFullSuccessAt || Date.now() - state.lastFullSuccessAt.getTime() >= FULL_SYNC_EVERY_MS;
    try {
      const { done } = await this.startRun({ mode: "IMPORT", scope: fullDue ? "FULL" : "INCREMENTAL", trigger: "SCHEDULED", actorId: null });
      return await done;
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.log("Scheduled Academy sync skipped: another run is in progress.");
        return null;
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Executing a run
  // ---------------------------------------------------------------------------------------------------------------

  private async execute(
    run: AcadSyncRunEntity,
    options: StartRunOptions,
    connection: AcademyConnection,
    state: AcadSyncStateEntity,
  ): Promise<AcadSyncRunEntity> {
    const ctx = this.newContext(options);
    try {
      await this.pullAndReconcile(connection, options, state, ctx);
      run.status = "SUCCEEDED";

      if (options.mode === "IMPORT") {
        const freshState = await this.stateRepository.getOrCreate();
        const now = new Date();
        freshState.lastSuccessAt = now;
        if (run.scope === "FULL") {
          freshState.lastFullSuccessAt = now;
        }
        freshState.lastUpdatedSince = laterOf(freshState.lastUpdatedSince, ctx.maxUpdatedAt);
        if (!freshState.firstImportConfirmedAt && options.trigger === "MANUAL") {
          freshState.firstImportConfirmedAt = now;
          freshState.firstImportConfirmedBy = options.actorId;
        }
        freshState.updatedBy = options.actorId;
        await this.stateRepository.save(freshState);
      }
    } catch (error) {
      run.status = "FAILED";
      run.error = this.describeError(error);
      this.logger.warn(`Academy sync ${run.mode}/${run.scope} failed: ${run.error}`);
    }

    run.counts = ctx.counts;
    run.issues = ctx.issues;
    run.issuesTotal = ctx.issuesTotal;
    run.finishedAt = new Date();
    let saved = run;
    try {
      saved = await this.runRepository.save(run);
    } catch (error) {
      this.logger.error(`Could not save the result of Academy sync run ${run.id}: ${this.describeError(error)}`);
    }
    // A scheduled run nobody is watching: told once, when the syncing STARTS failing (the run before it did not fail).
    if (saved.status === "FAILED" && options.trigger !== "MANUAL") {
      await this.tellSyncFailing(saved);
    }
    return saved;
  }

  private async tellSyncFailing(run: AcadSyncRunEntity): Promise<void> {
    try {
      const previous = (await this.runRepository.listRecent(2)).find((other) => other.id !== run.id);
      if (previous?.status === "FAILED") return;
      await this.notifications?.emit({
        code: "ACADEMY_SYNC_FAILING",
        params: { reason: (run.error ?? "").slice(0, 200) },
        link: "/license",
        entityType: "acad_sync_run",
        entityId: run.id,
      });
    } catch (error) {
      this.logger.warn(`Academy sync failed and accounts could not be told: ${this.describeError(error)}`);
    }
  }

  private newContext(options: StartRunOptions): RunContext {
    return {
      dryRun: options.mode === "PREVIEW",
      actorId: options.actorId,
      today: new Date().toISOString().slice(0, 10),
      counts: Object.fromEntries(ZERO_COUNTS.map((key) => [key, 0])),
      issues: [],
      issuesTotal: 0,
      claimedAdmissionNos: new Map(),
      seenAcademyIds: new Set(),
      maxUpdatedAt: null,
      erpClasses: null,
      levelCache: new Map(),
      streamCache: new Map(),
      plannedClasses: new Set(),
      plannedStreams: new Set(),
    };
  }

  private async pullAndReconcile(
    connection: AcademyConnection,
    options: StartRunOptions,
    state: AcadSyncStateEntity,
    ctx: RunContext,
  ): Promise<void> {
    const full = options.scope === "FULL" || !state.firstImportConfirmedAt;
    let cursor: string | null = null;
    do {
      const page = await this.client.listStudents(connection.apiKey, {
        cursor,
        updatedSince: full ? null : state.lastUpdatedSince,
        limit: PAGE_SIZE,
        includeDeleted: true,
      });
      const maps = await this.studentMapRepository.findByAcademyIds(page.items.map((item) => item.id));
      const mapById = new Map(maps.map((map) => [map.academyStudentId, map]));
      for (const student of page.items) {
        await this.processStudent(student, mapById.get(student.id) ?? null, ctx);
      }
      cursor = page.nextCursor;
    } while (cursor);

    if (full) {
      await this.reportMissing(ctx);
    }
  }

  /** After a complete FULL pass: mapped students the Academy did not return at all. Reported, never acted on. */
  private async reportMissing(ctx: RunContext): Promise<void> {
    const mapped = await this.studentMapRepository.listAcademyIds();
    for (const row of mapped) {
      if (row.removedInAcademy || ctx.seenAcademyIds.has(row.academyStudentId)) {
        continue;
      }
      ctx.counts.missing++;
      this.addIssue(ctx, {
        code: "MISSING_FROM_ACADEMY",
        academyStudentId: row.academyStudentId,
        message: "This student is linked to the Academy but no longer appears there. They have been left untouched in the ERP.",
      });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // One student
  // ---------------------------------------------------------------------------------------------------------------

  private async processStudent(student: AcademyStudentDto, map: AcadStudentMapEntity | null, ctx: RunContext): Promise<void> {
    ctx.counts.seen++;
    ctx.seenAcademyIds.add(student.id);
    ctx.maxUpdatedAt = laterOf(ctx.maxUpdatedAt, student.updatedAt);
    try {
      if (student.deletedAt) {
        await this.handleRemoved(student, map, ctx);
      } else if (map) {
        await this.updateLinked(student, map, ctx);
      } else {
        await this.linkOrCreate(student, ctx);
      }
    } catch (error) {
      ctx.counts.errors++;
      this.addIssue(ctx, {
        code: "ERROR",
        academyStudentId: student.id,
        admissionNo: student.admissionNumber,
        studentName: student.fullName,
        message: this.describeError(error),
      });
    }
  }

  private async handleRemoved(student: AcademyStudentDto, map: AcadStudentMapEntity | null, ctx: RunContext): Promise<void> {
    if (!map) {
      ctx.counts.skipped++;
      return;
    }
    if (map.removedInAcademy) {
      ctx.counts.unchanged++;
      return;
    }
    ctx.counts.removed++;
    this.addIssue(ctx, this.issueFor(student, "REMOVED_IN_ACADEMY", "Removed in the Academy. The student has been kept in the ERP."));
    if (!ctx.dryRun) {
      map.removedInAcademy = true;
      map.lastSeenAt = new Date();
      await this.studentMapRepository.save(map);
    }
  }

  /** A student the ERP already knows through an earlier sync. */
  private async updateLinked(student: AcademyStudentDto, map: AcadStudentMapEntity, ctx: RunContext): Promise<void> {
    const hash = fingerprintStudent(student);
    const admissionNo = student.admissionNumber?.trim() || null;

    if (student.status !== "ACTIVE" && map.academyStatus === "ACTIVE") {
      this.addIssue(
        ctx,
        this.issueFor(
          student,
          "STATUS_CHANGED",
          `The Academy now shows this student as ${student.status}. Change their status in the ERP once their balance is cleared.`,
        ),
      );
    }
    if (admissionNo && map.academyAdmissionNo && admissionNo !== map.academyAdmissionNo) {
      this.addIssue(
        ctx,
        this.issueFor(
          student,
          "ADMISSION_NO_CHANGED",
          `The Academy changed the admission number from ${map.academyAdmissionNo} to ${admissionNo}. The ERP keeps its own, because receipts and payments are matched on it.`,
        ),
      );
    }

    if (map.lastHash === hash && !map.removedInAcademy) {
      ctx.counts.unchanged++;
      return;
    }

    const erpStudent = await this.studentRepository.findById(map.studentId);
    if (!erpStudent) {
      throw new Error(`The linked ERP student ${map.studentId} no longer exists.`);
    }

    const split = splitFullName(student.fullName);
    if (split && (split.firstName !== erpStudent.firstName || split.middleName !== erpStudent.middleName || split.lastName !== erpStudent.lastName)) {
      if (!ctx.dryRun) {
        await this.studentsService.update(erpStudent.id, { firstName: split.firstName, middleName: split.middleName, lastName: split.lastName }, ctx.actorId);
      }
    }

    await this.reportClassMismatch(student, erpStudent.classId, ctx);
    await this.syncGuardians(erpStudent.id, student.parents, ctx);

    ctx.counts.updated++;
    if (!ctx.dryRun) {
      map.academyStatus = student.status;
      map.academyAdmissionNo = admissionNo;
      map.lastHash = hash;
      map.lastSeenAt = new Date();
      map.removedInAcademy = false;
      map.updatedBy = ctx.actorId;
      await this.studentMapRepository.save(map);
    }
  }

  /** A student the ERP has not been introduced to: adopt an existing ERP student with the same admission number, or create one. */
  private async linkOrCreate(student: AcademyStudentDto, ctx: RunContext): Promise<void> {
    const admissionNo = student.admissionNumber?.trim() || null;
    if (!admissionNo) {
      ctx.counts.skipped++;
      this.addIssue(ctx, this.issueFor(student, "NO_ADMISSION_NUMBER", "The Academy has no admission number for this student, so the ERP cannot match payments to them. Add one in the Academy."));
      return;
    }

    const claimedBy = ctx.claimedAdmissionNos.get(admissionNo);
    if (claimedBy && claimedBy !== student.id) {
      ctx.counts.skipped++;
      this.addIssue(ctx, this.issueFor(student, "ADMISSION_NO_CONFLICT", `Admission number ${admissionNo} is also used by another student in the Academy. Fix one of them there.`));
      return;
    }
    ctx.claimedAdmissionNos.set(admissionNo, student.id);

    const hash = fingerprintStudent(student);
    const existing = await this.studentRepository.findByAdmissionNo(admissionNo);

    if (existing) {
      const linkedElsewhere = await this.studentMapRepository.findByStudentId(existing.id);
      if (linkedElsewhere && linkedElsewhere.academyStudentId !== student.id) {
        ctx.counts.skipped++;
        this.addIssue(ctx, this.issueFor(student, "ADMISSION_NO_CONFLICT", `Admission number ${admissionNo} in the ERP is already linked to a different Academy student.`));
        return;
      }
      ctx.counts.linked++;
      if (student.status !== "ACTIVE") {
        this.addIssue(ctx, this.issueFor(student, "STATUS_CHANGED", `The Academy shows this student as ${student.status}. Check their status in the ERP.`));
      }
      await this.reportClassMismatch(student, existing.classId, ctx);
      if (ctx.dryRun) {
        await this.syncGuardians(null, student.parents, ctx);
        return;
      }
      const adopted = await this.studentMapRepository.create({
        studentId: existing.id,
        academyStudentId: student.id,
        academyAdmissionNo: admissionNo,
        academyStatus: student.status,
        lastHash: PENDING_HASH,
        lastSeenAt: new Date(),
        removedInAcademy: false,
        linkedBy: "ADMISSION_NO",
        createdBy: ctx.actorId,
        updatedBy: ctx.actorId,
      });
      await this.syncGuardians(existing.id, student.parents, ctx);
      await this.markApplied(adopted, hash);
      return;
    }

    if (student.status !== "ACTIVE") {
      // Not worth bringing a former student into the ERP just because the Academy knows them.
      ctx.counts.skipped++;
      return;
    }

    const split = splitFullName(student.fullName);
    if (!split) {
      ctx.counts.skipped++;
      this.addIssue(ctx, this.issueFor(student, "NAME_INCOMPLETE", "The Academy name has only one word; the ERP needs a first and a last name. Complete it in the Academy."));
      return;
    }

    const resolved = await this.resolveClass(student, ctx, true);
    if (!resolved) {
      ctx.counts.skipped++;
      this.addIssue(ctx, this.issueFor(student, "NO_CLASS", "The Academy has no class for this student, so the ERP cannot place them. Set their class in the Academy."));
      return;
    }

    ctx.counts.created++;
    if (ctx.dryRun) {
      await this.syncGuardians(null, student.parents, ctx);
      return;
    }

    const created = await this.studentsService.create(
      {
        admissionNo,
        firstName: split.firstName,
        middleName: split.middleName,
        lastName: split.lastName,
        classId: resolved.classId as string,
        streamId: resolved.streamId,
        enrolledOn: ctx.today,
      },
      ctx.actorId,
    );
    const createdMap = await this.studentMapRepository.create({
      studentId: created.id,
      academyStudentId: student.id,
      academyAdmissionNo: admissionNo,
      academyStatus: student.status,
      lastHash: PENDING_HASH,
      lastSeenAt: new Date(),
      removedInAcademy: false,
      linkedBy: "CREATED",
      createdBy: ctx.actorId,
      updatedBy: ctx.actorId,
    });
    await this.syncGuardians(created.id, student.parents, ctx);
    await this.markApplied(createdMap, hash);
  }

  /**
   * A mapping is written BEFORE the guardians are synced, with a placeholder fingerprint that can never match, and only
   * given the real one once the guardians went through. If guardian sync fails, the next run sees a changed fingerprint
   * and finishes the job instead of treating the half-done student as up to date.
   */
  private async markApplied(map: AcadStudentMapEntity, hash: string): Promise<void> {
    map.lastHash = hash;
    map.lastSeenAt = new Date();
    await this.studentMapRepository.save(map);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Classes and streams
  // ---------------------------------------------------------------------------------------------------------------

  /** An already-placed student whose Academy class differs from the ERP's. Never moved automatically (billing depends on the class). */
  private async reportClassMismatch(student: AcademyStudentDto, erpClassId: string, ctx: RunContext): Promise<void> {
    const resolved = await this.resolveClass(student, ctx, false);
    if (resolved?.classId === erpClassId) {
      return;
    }
    // Unresolved means the Academy level has no ERP class yet (no mapping, no class of that name) — which still differs
    // from wherever the ERP has this student, so it is reported too; there is just nothing to compare ids against.
    if (!resolved?.classId && !student.levelName?.trim()) {
      return;
    }
    const erpClass = await this.classRepository.findById(erpClassId);
    this.addIssue(
      ctx,
      this.issueFor(
        student,
        "CLASS_MISMATCH",
        `The Academy has this student in ${student.levelName ?? "another class"} but the ERP has them in ${erpClass?.name ?? "a different class"}. Not changed — move them in the ERP when ready.`,
      ),
    );
  }

  /**
   * The ERP class (and stream) for a student's Academy level (and stream): an existing mapping, else the ERP class with
   * the same name, else — only when `createMissing` — a new one. In a preview nothing is written; a class/stream that
   * WOULD be created is counted and returned with a null id.
   */
  private async resolveClass(student: AcademyStudentDto, ctx: RunContext, createMissing: boolean): Promise<ResolvedClass | null> {
    const levelId = student.levelId;
    const levelName = student.levelName?.trim();
    if (!levelId || !levelName) {
      return null;
    }

    let level = ctx.levelCache.get(levelId);
    if (!level) {
      const mapped = await this.classMapRepository.find("LEVEL", levelId);
      if (mapped) {
        level = { classId: mapped.classId, streamId: null, name: levelName };
      } else {
        const classes = await this.erpClassList(ctx);
        const sameName = classes.find((klass) => klass.name.trim().toLowerCase() === levelName.toLowerCase());
        if (sameName) {
          if (!ctx.dryRun) {
            await this.classMapRepository.create({
              kind: "LEVEL",
              academyId: levelId,
              academyName: levelName,
              classId: sameName.id,
              streamId: null,
              autoCreated: false,
              createdBy: ctx.actorId,
              updatedBy: ctx.actorId,
            });
          }
          ctx.counts.classesMapped++;
          level = { classId: sameName.id, streamId: null, name: levelName };
        } else if (!createMissing) {
          return null;
        } else if (ctx.dryRun) {
          if (!ctx.plannedClasses.has(levelId)) {
            ctx.plannedClasses.add(levelId);
            ctx.counts.classesCreated++;
          }
          level = { classId: null, streamId: null, name: levelName };
        } else {
          const nextLevel = Math.max(0, ...classes.map((klass) => klass.level)) + 1;
          const createdClass = await this.classesService.create({ name: levelName.slice(0, 40), level: levelNumberFromName(levelName) ?? nextLevel }, ctx.actorId);
          ctx.erpClasses?.push(createdClass);
          await this.classMapRepository.create({
            kind: "LEVEL",
            academyId: levelId,
            academyName: levelName,
            classId: createdClass.id,
            streamId: null,
            autoCreated: true,
            createdBy: ctx.actorId,
            updatedBy: ctx.actorId,
          });
          ctx.counts.classesCreated++;
          level = { classId: createdClass.id, streamId: null, name: levelName };
        }
      }
      ctx.levelCache.set(levelId, level);
    }

    const streamId = student.streamId;
    const streamName = student.streamName?.trim();
    if (!streamId || !streamName) {
      return { classId: level.classId, streamId: null };
    }
    return { classId: level.classId, streamId: await this.resolveStream(streamId, streamName, level.classId, ctx, createMissing) };
  }

  private async resolveStream(academyStreamId: string, streamName: string, classId: string | null, ctx: RunContext, createMissing: boolean): Promise<string | null> {
    const cached = ctx.streamCache.get(academyStreamId);
    if (cached) {
      return cached.streamId;
    }
    const mapped = await this.classMapRepository.find("STREAM", academyStreamId);
    if (mapped) {
      ctx.streamCache.set(academyStreamId, { classId: mapped.classId, streamId: mapped.streamId });
      return mapped.streamId;
    }
    if (!classId) {
      // The class itself is only planned (preview), so its stream is too.
      if (createMissing && !ctx.plannedStreams.has(academyStreamId)) {
        ctx.plannedStreams.add(academyStreamId);
        ctx.counts.streamsCreated++;
      }
      return null;
    }

    const sameName = await this.streamRepository.findByClassAndName(classId, streamName);
    if (sameName) {
      if (!ctx.dryRun) {
        await this.classMapRepository.create({
          kind: "STREAM",
          academyId: academyStreamId,
          academyName: streamName,
          classId,
          streamId: sameName.id,
          autoCreated: false,
          createdBy: ctx.actorId,
          updatedBy: ctx.actorId,
        });
      }
      ctx.counts.streamsMapped++;
      ctx.streamCache.set(academyStreamId, { classId, streamId: sameName.id });
      return sameName.id;
    }
    if (!createMissing) {
      return null;
    }
    if (ctx.dryRun) {
      if (!ctx.plannedStreams.has(academyStreamId)) {
        ctx.plannedStreams.add(academyStreamId);
        ctx.counts.streamsCreated++;
      }
      return null;
    }
    const createdStream = await this.streamsService.create({ classId, name: streamName.slice(0, 40) }, ctx.actorId);
    await this.classMapRepository.create({
      kind: "STREAM",
      academyId: academyStreamId,
      academyName: streamName,
      classId,
      streamId: createdStream.id,
      autoCreated: true,
      createdBy: ctx.actorId,
      updatedBy: ctx.actorId,
    });
    ctx.counts.streamsCreated++;
    ctx.streamCache.set(academyStreamId, { classId, streamId: createdStream.id });
    return createdStream.id;
  }

  private async erpClassList(ctx: RunContext): Promise<StdClassEntity[]> {
    if (!ctx.erpClasses) {
      ctx.erpClasses = await this.classesService.list();
    }
    return ctx.erpClasses;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Guardians
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Makes sure each Academy parent exists as an ERP guardian and is linked to the student. `studentId` is `null` in a
   * preview for a student that does not exist yet (guardians are then only counted). The first parent becomes the
   * primary guardian when the student has none, and only a primary guardian is flagged to receive billing — an admin
   * widens that in the ERP.
   */
  private async syncGuardians(studentId: string | null, parents: AcademyParentDto[], ctx: RunContext): Promise<void> {
    if (parents.length === 0) {
      return;
    }
    const existingLinks = studentId ? await this.guardiansService.listForStudent(studentId) : [];
    const linkedGuardianIds = new Set(existingLinks.map((link) => link.guardianId));
    let hasPrimary = existingLinks.some((link) => link.isPrimary);

    for (const parent of parents) {
      const fullName = `${parent.firstName ?? ""} ${parent.lastName ?? ""}`.trim();
      const phone = normalizePhone(parent.phoneNumber);
      const email = parent.email?.trim().toLowerCase() || null;
      if (!fullName || (!phone && !email)) {
        this.addIssue(ctx, {
          code: "PARENT_NO_CONTACT",
          message: `A parent (${fullName || parent.id}) has no phone number or email in the Academy, so they were not added to the ERP.`,
        });
        continue;
      }

      const mapped = await this.guardianMapRepository.findByAcademyParentId(parent.id);
      let guardianId = mapped?.guardianId ?? null;

      if (!guardianId) {
        if (ctx.dryRun) {
          ctx.counts.guardiansCreated++;
          continue;
        }
        const { guardian, wasExisting } = await this.guardiansService.create({ fullName: fullName.slice(0, 120), phone, email }, ctx.actorId);
        ctx.counts[wasExisting ? "guardiansAdopted" : "guardiansCreated"]++;
        await this.guardianMapRepository.create({
          guardianId: guardian.id,
          academyParentId: parent.id,
          lastSeenAt: new Date(),
          createdBy: ctx.actorId,
          updatedBy: ctx.actorId,
        });
        guardianId = guardian.id;
      }

      if (ctx.dryRun || !studentId || linkedGuardianIds.has(guardianId)) {
        continue;
      }
      const isPrimary = !hasPrimary;
      await this.guardiansService.linkToStudent(studentId, guardianId, parent.relationship?.trim() || "Parent", isPrimary, isPrimary, ctx.actorId);
      linkedGuardianIds.add(guardianId);
      hasPrimary = hasPrimary || isPrimary;
      ctx.counts.guardiansLinked++;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------------------------------

  private issueFor(student: AcademyStudentDto, code: string, message: string): AcadSyncIssue {
    return { code, message, academyStudentId: student.id, admissionNo: student.admissionNumber?.trim() || null, studentName: student.fullName };
  }

  private addIssue(ctx: RunContext, issue: AcadSyncIssue): void {
    ctx.issuesTotal++;
    if (ctx.issues.length < MAX_STORED_ISSUES) {
      ctx.issues.push(issue);
    }
  }

  private describeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 300);
  }
}
