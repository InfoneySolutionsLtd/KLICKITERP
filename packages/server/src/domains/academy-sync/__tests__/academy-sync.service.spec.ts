/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { AcademySyncService, StartRunOptions } from "../application/academy-sync.service";
import { AcademyParentDto, AcademyStudentDto } from "../application/academy-sync.types";
import { fingerprintStudent } from "../application/academy-sync.util";

type Row = Record<string, any>;

const parent = (over: Partial<AcademyParentDto> = {}): AcademyParentDto => ({
  id: "p1",
  firstName: "Grace",
  lastName: "Kamau",
  email: "grace@example.com",
  phoneNumber: "+254712345678",
  relationship: "Mother",
  status: "ACTIVE",
  ...over,
});

const acad = (over: Partial<AcademyStudentDto> = {}): AcademyStudentDto => ({
  id: "a1",
  fullName: "Amina Wanjiru Kamau",
  admissionNumber: "1001",
  status: "ACTIVE",
  gender: "F",
  dateOfBirth: null,
  nationalId: null,
  levelId: "L4",
  levelName: "Grade 4",
  streamId: "S1",
  streamName: "North",
  accountType: "SCHOOL",
  parents: [parent()],
  updatedAt: "2026-11-01T10:00:00.000Z",
  deletedAt: null,
  ...over,
});

/** The service wired to in-memory fakes of everything it touches, so whole runs can be exercised and inspected. */
function makeHarness(init: { pages?: AcademyStudentDto[][]; erpStudents?: Row[]; erpClasses?: Row[]; connected?: boolean } = {}) {
  let pages = init.pages ?? [[]];
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  const erp = {
    students: new Map<string, Row>((init.erpStudents ?? []).map((s) => [s.id, s])),
    classes: [...(init.erpClasses ?? [])] as Row[],
    streams: [] as Row[],
    guardians: [] as Row[],
    links: [] as Row[],
  };
  const maps = { students: [] as Row[], guardians: [] as Row[], classes: [] as Row[] };
  const runs: Row[] = [];
  const state: Row = {
    singleton: true,
    firstImportConfirmedAt: null,
    firstImportConfirmedBy: null,
    autoSyncEnabled: false,
    lastSuccessAt: null,
    lastFullSuccessAt: null,
    lastUpdatedSince: null,
  };
  let connected = init.connected ?? true;
  const failures = { createFor: new Set<string>(), linkGuardian: false, gateway: null as Error | null };

  const academyLink = {
    getConnection: jest.fn(async () => (connected ? { apiKey: "kfe_test_key", academySchoolId: "sch-1", academySchoolCode: "SCH" } : null)),
  };
  const client = {
    listStudents: jest.fn(async (_apiKey: string, params: { cursor?: string | null }) => {
      if (failures.gateway) throw failures.gateway;
      const index = params.cursor ? Number(params.cursor.slice(1)) : 0;
      return { items: pages[index] ?? [], nextCursor: index + 1 < pages.length ? `c${index + 1}` : null, serverTime: "now" };
    }),
  };
  const studentsService = {
    create: jest.fn(async (input: Row) => {
      if (failures.createFor.has(input.admissionNo)) throw new Error(`boom for ${input.admissionNo}`);
      const row = { id: nextId("erp-student"), status: "ACTIVE", ...input };
      erp.students.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, changes: Row) => Object.assign(erp.students.get(id) as Row, changes)),
  };
  const studentRepository = {
    findByAdmissionNo: jest.fn(async (adm: string) => [...erp.students.values()].find((s) => s.admissionNo === adm) ?? null),
    findById: jest.fn(async (id: string) => erp.students.get(id) ?? null),
  };
  const classesService = {
    list: jest.fn(async () => [...erp.classes]),
    create: jest.fn(async (input: Row) => {
      const row = { id: nextId("erp-class"), ...input };
      erp.classes.push(row);
      return row;
    }),
  };
  const classRepository = { findById: jest.fn(async (id: string) => erp.classes.find((c) => c.id === id) ?? null) };
  const streamsService = {
    create: jest.fn(async (input: Row) => {
      const row = { id: nextId("erp-stream"), ...input };
      erp.streams.push(row);
      return row;
    }),
  };
  const streamRepository = {
    findByClassAndName: jest.fn(async (classId: string, name: string) => erp.streams.find((s) => s.classId === classId && s.name.toLowerCase() === name.toLowerCase()) ?? null),
  };
  const guardiansService = {
    create: jest.fn(async (input: Row) => {
      const existing = erp.guardians.find((g) => (input.phone && g.phone === input.phone) || (input.email && g.email === input.email));
      if (existing) return { guardian: existing, wasExisting: true };
      const row = { id: nextId("erp-guardian"), ...input };
      erp.guardians.push(row);
      return { guardian: row, wasExisting: false };
    }),
    listForStudent: jest.fn(async (studentId: string) => erp.links.filter((l) => l.studentId === studentId)),
    linkToStudent: jest.fn(async (studentId: string, guardianId: string, relationship: string, isPrimary: boolean, receivesBilling: boolean) => {
      if (failures.linkGuardian) throw new Error("guardian link failed");
      const row = { studentId, guardianId, relationship, isPrimary, receivesBilling };
      erp.links.push(row);
      return row;
    }),
  };
  const runRepository = {
    create: jest.fn(async (data: Row) => {
      if (runs.some((r) => r.status === "RUNNING")) throw Object.assign(new Error("duplicate key"), { code: "23505" });
      const row = { id: nextId("run"), ...data };
      runs.push(row);
      return row;
    }),
    save: jest.fn(async (row: Row) => row),
    findById: jest.fn(async (id: string) => runs.find((r) => r.id === id) ?? null),
    findRunning: jest.fn(async () => runs.find((r) => r.status === "RUNNING") ?? null),
    listRecent: jest.fn(async () => [...runs].reverse()),
    findLastSucceeded: jest.fn(async (mode: string) => [...runs].reverse().find((r) => r.status === "SUCCEEDED" && r.mode === mode) ?? null),
    failStale: jest.fn(async () => 0),
  };
  const stateRepository = { getOrCreate: jest.fn(async () => state), save: jest.fn(async (s: Row) => s) };
  const studentMapRepository = {
    findByAcademyIds: jest.fn(async (ids: string[]) => maps.students.filter((m) => ids.includes(m.academyStudentId))),
    findByStudentId: jest.fn(async (id: string) => maps.students.find((m) => m.studentId === id) ?? null),
    create: jest.fn(async (data: Row) => {
      const row = { id: nextId("map"), ...data };
      maps.students.push(row);
      return row;
    }),
    save: jest.fn(async (row: Row) => row),
    count: jest.fn(async () => maps.students.length),
    listAcademyIds: jest.fn(async () => maps.students.map((m) => ({ academyStudentId: m.academyStudentId, studentId: m.studentId, removedInAcademy: m.removedInAcademy }))),
  };
  const guardianMapRepository = {
    findByAcademyParentId: jest.fn(async (id: string) => maps.guardians.find((m) => m.academyParentId === id) ?? null),
    create: jest.fn(async (data: Row) => {
      const row = { id: nextId("gmap"), ...data };
      maps.guardians.push(row);
      return row;
    }),
  };
  const classMapRepository = {
    find: jest.fn(async (kind: string, academyId: string) => maps.classes.find((m) => m.kind === kind && m.academyId === academyId) ?? null),
    create: jest.fn(async (data: Row) => {
      const row = { id: nextId("cmap"), ...data };
      maps.classes.push(row);
      return row;
    }),
  };

  const service = new AcademySyncService(
    academyLink as any,
    client as any,
    studentsService as any,
    studentRepository as any,
    classesService as any,
    classRepository as any,
    streamsService as any,
    streamRepository as any,
    guardiansService as any,
    runRepository as any,
    stateRepository as any,
    studentMapRepository as any,
    guardianMapRepository as any,
    classMapRepository as any,
  );

  const run = async (options: Partial<StartRunOptions> & Pick<StartRunOptions, "mode">) => {
    const { done } = await service.startRun({ scope: "FULL", trigger: "MANUAL", actorId: "admin-1", ...options });
    return done;
  };
  const preview = () => run({ mode: "PREVIEW" });
  const firstImport = async () => {
    await preview();
    return run({ mode: "IMPORT", confirmFirstImport: true });
  };

  return {
    service, erp, maps, runs, state, failures,
    mocks: { academyLink, client, studentsService, studentRepository, classesService, streamsService, guardiansService, studentMapRepository, guardianMapRepository, classMapRepository, runRepository },
    setPages: (p: AcademyStudentDto[][]) => (pages = p),
    setConnected: (c: boolean) => (connected = c),
    run, preview, firstImport,
  };
}

const issueCodes = (run: Row) => (run.issues as Array<{ code: string }>).map((i) => i.code);

describe("AcademySyncService — starting a run", () => {
  it("refuses when the ERP is not connected to an Academy school", async () => {
    const h = makeHarness({ connected: false });
    await expect(h.service.startRun({ mode: "PREVIEW", scope: "FULL", trigger: "MANUAL", actorId: "a" })).rejects.toBeInstanceOf(ValidationException);
  });

  it("will not import before a preview has been run", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await expect(h.run({ mode: "IMPORT", confirmFirstImport: true })).rejects.toThrow(/preview first/i);
    expect(h.mocks.studentsService.create).not.toHaveBeenCalled();
  });

  it("will not import the first time without the admin's confirmation", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.preview();
    await expect(h.run({ mode: "IMPORT" })).rejects.toThrow(/confirm the first import/i);
    expect(h.mocks.studentsService.create).not.toHaveBeenCalled();
  });

  it("will not let a scheduled run be the first import", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.preview();
    await expect(h.service.startRun({ mode: "IMPORT", scope: "FULL", trigger: "SCHEDULED", actorId: null })).rejects.toBeInstanceOf(ValidationException);
  });

  it("allows only one run at a time", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    h.runs.push({ id: "other", status: "RUNNING" });
    await expect(h.service.startRun({ mode: "PREVIEW", scope: "FULL", trigger: "MANUAL", actorId: "a" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("clears runs lost to a crash before starting a new one", async () => {
    const h = makeHarness();
    await h.preview();
    expect(h.mocks.runRepository.failStale).toHaveBeenCalled();
  });

  it("forces the first preview and import to read everyone, whatever scope was asked for", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    const preview = await h.run({ mode: "PREVIEW", scope: "INCREMENTAL" });
    expect(preview.scope).toBe("FULL");
    const imported = await h.run({ mode: "IMPORT", scope: "INCREMENTAL", confirmFirstImport: true });
    expect(imported.scope).toBe("FULL");
  });
});

describe("AcademySyncService — preview", () => {
  it("changes nothing in the ERP, but reports what an import would do", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    const run = await h.preview();
    expect(run.status).toBe("SUCCEEDED");
    expect(run.counts).toMatchObject({ seen: 1, created: 1, classesCreated: 1, streamsCreated: 1, guardiansCreated: 1 });
    expect(h.mocks.studentsService.create).not.toHaveBeenCalled();
    expect(h.mocks.classesService.create).not.toHaveBeenCalled();
    expect(h.mocks.streamsService.create).not.toHaveBeenCalled();
    expect(h.mocks.guardiansService.create).not.toHaveBeenCalled();
    expect(h.maps.students).toHaveLength(0);
    expect(h.maps.classes).toHaveLength(0);
    expect(h.maps.guardians).toHaveLength(0);
  });

  it("does not advance the sync state or confirm the first import", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.preview();
    expect(h.state.firstImportConfirmedAt).toBeNull();
    expect(h.state.lastUpdatedSince).toBeNull();
    expect(h.state.lastSuccessAt).toBeNull();
  });

  it("counts a class that already exists in the ERP as mapped, not created", async () => {
    const h = makeHarness({ pages: [[acad()]], erpClasses: [{ id: "c4", name: "grade 4", level: 4 }] });
    const run = await h.preview();
    expect(run.counts.classesCreated).toBe(0);
    expect(run.counts.classesMapped).toBe(1);
    expect(h.maps.classes).toHaveLength(0); // preview never writes the mapping
  });

  it("counts a shared class once, not once per student", async () => {
    const h = makeHarness({ pages: [[acad({ id: "a1", admissionNumber: "1" }), acad({ id: "a2", admissionNumber: "2", parents: [] }), acad({ id: "a3", admissionNumber: "3", parents: [] })]] });
    const run = await h.preview();
    expect(run.counts.created).toBe(3);
    expect(run.counts.classesCreated).toBe(1);
    expect(run.counts.streamsCreated).toBe(1);
  });
});

describe("AcademySyncService — first import", () => {
  it("creates the student, class, stream and guardian, links them and records the mapping", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    const run = await h.firstImport();

    expect(run.status).toBe("SUCCEEDED");
    expect(run.counts).toMatchObject({ seen: 1, created: 1, classesCreated: 1, streamsCreated: 1, guardiansCreated: 1, guardiansLinked: 1, errors: 0 });

    expect(h.erp.classes).toEqual([expect.objectContaining({ name: "Grade 4", level: 4 })]);
    expect(h.erp.streams).toEqual([expect.objectContaining({ name: "North", classId: h.erp.classes[0].id })]);
    const [student] = [...h.erp.students.values()];
    expect(student).toMatchObject({ admissionNo: "1001", firstName: "Amina", middleName: "Wanjiru", lastName: "Kamau", classId: h.erp.classes[0].id, streamId: h.erp.streams[0].id });
    expect(student.enrolledOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(h.mocks.studentsService.create).toHaveBeenCalledWith(expect.anything(), "admin-1");

    expect(h.erp.guardians).toEqual([expect.objectContaining({ fullName: "Grace Kamau", phone: "0712345678", email: "grace@example.com" })]);
    expect(h.erp.links).toEqual([expect.objectContaining({ studentId: student.id, isPrimary: true, receivesBilling: true, relationship: "Mother" })]);

    expect(h.maps.students).toEqual([expect.objectContaining({ studentId: student.id, academyStudentId: "a1", linkedBy: "CREATED", lastHash: fingerprintStudent(acad()) })]);
    expect(h.maps.classes.map((m) => [m.kind, m.academyId, m.autoCreated])).toEqual([["LEVEL", "L4", true], ["STREAM", "S1", true]]);
  });

  it("confirms the first import and advances the cursor", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    expect(h.state.firstImportConfirmedAt).toBeInstanceOf(Date);
    expect(h.state.firstImportConfirmedBy).toBe("admin-1");
    expect(h.state.lastSuccessAt).toBeInstanceOf(Date);
    expect(h.state.lastFullSuccessAt).toBeInstanceOf(Date);
    expect(h.state.lastUpdatedSince).toBe("2026-11-01T10:00:00.000Z");
  });

  it("walks every page", async () => {
    const h = makeHarness({ pages: [[acad({ id: "a1", admissionNumber: "1", parents: [] })], [acad({ id: "a2", admissionNumber: "2", parents: [] })], [acad({ id: "a3", admissionNumber: "3", parents: [] })]] });
    const run = await h.firstImport();
    expect(run.counts.created).toBe(3);
    expect(h.mocks.client.listStudents).toHaveBeenCalledWith("kfe_test_key", expect.objectContaining({ cursor: "c1" }));
    expect(h.mocks.client.listStudents).toHaveBeenCalledWith("kfe_test_key", expect.objectContaining({ cursor: "c2" }));
  });

  it("is idempotent: the same data again changes nothing", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    const again = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(again.counts).toMatchObject({ seen: 1, created: 0, updated: 0, unchanged: 1 });
    expect(h.mocks.studentsService.create).toHaveBeenCalledTimes(1);
    expect(h.mocks.guardiansService.create).toHaveBeenCalledTimes(1);
    expect(h.erp.students.size).toBe(1);
  });

  it("an incremental run asks only for what changed since the last one", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    h.mocks.client.listStudents.mockClear();
    await h.run({ mode: "IMPORT", scope: "INCREMENTAL" });
    expect(h.mocks.client.listStudents).toHaveBeenCalledWith("kfe_test_key", expect.objectContaining({ updatedSince: "2026-11-01T10:00:00.000Z" }));
  });

  it("makes the first parent the primary guardian and flags only that one for billing", async () => {
    const h = makeHarness({ pages: [[acad({ parents: [parent({ id: "p1" }), parent({ id: "p2", firstName: "Peter", phoneNumber: "0722000000", email: null, relationship: "Father" })] })]] });
    await h.firstImport();
    expect(h.erp.links.map((l) => [l.isPrimary, l.receivesBilling])).toEqual([[true, true], [false, false]]);
  });

  it("reuses an ERP guardian with the same phone number instead of creating a duplicate", async () => {
    const h = makeHarness({ pages: [[acad({ id: "a1", admissionNumber: "1", parents: [parent({ id: "p1" })] }), acad({ id: "a2", admissionNumber: "2", parents: [parent({ id: "p9", phoneNumber: "0712 345 678", email: null })] })]] });
    const run = await h.firstImport();
    expect(h.erp.guardians).toHaveLength(1);
    expect(run.counts).toMatchObject({ guardiansCreated: 1, guardiansAdopted: 1, guardiansLinked: 2 });
  });

  it("skips and reports a parent with no phone or email", async () => {
    const h = makeHarness({ pages: [[acad({ parents: [parent({ phoneNumber: null, email: null })] })]] });
    const run = await h.firstImport();
    expect(h.erp.guardians).toHaveLength(0);
    expect(issueCodes(run)).toContain("PARENT_NO_CONTACT");
    expect(run.counts.created).toBe(1); // the student itself still comes across
  });
});

describe("AcademySyncService — matching and safety rules", () => {
  it("adopts an existing ERP student with the same admission number instead of creating a second one", async () => {
    const h = makeHarness({
      pages: [[acad()]],
      erpStudents: [{ id: "erp-existing", admissionNo: "1001", firstName: "Amina", lastName: "K", classId: "c-old" }],
      erpClasses: [{ id: "c-old", name: "Grade 3", level: 3 }],
    });
    const run = await h.firstImport();
    expect(h.mocks.studentsService.create).not.toHaveBeenCalled();
    expect(run.counts).toMatchObject({ linked: 1, created: 0 });
    expect(h.maps.students).toEqual([expect.objectContaining({ studentId: "erp-existing", linkedBy: "ADMISSION_NO" })]);
    // never rewrites what the ERP already holds for an adopted student
    expect(h.mocks.studentsService.update).not.toHaveBeenCalled();
    expect(h.erp.students.get("erp-existing")?.lastName).toBe("K");
    expect(h.erp.links).toHaveLength(1); // but its guardians are brought in
  });

  it("does not move an adopted student to a different class — it reports the difference", async () => {
    const h = makeHarness({
      pages: [[acad()]],
      erpStudents: [{ id: "erp-existing", admissionNo: "1001", firstName: "Amina", lastName: "K", classId: "c-old" }],
      erpClasses: [{ id: "c-old", name: "Grade 3", level: 3 }],
    });
    const run = await h.firstImport();
    expect(issueCodes(run)).toContain("CLASS_MISMATCH");
    expect(run.issues.find((i: any) => i.code === "CLASS_MISMATCH")?.message).toMatch(/Grade 4.*Grade 3/);
    expect(h.erp.students.get("erp-existing")?.classId).toBe("c-old");
  });

  it("skips a student with no admission number and says why", async () => {
    const h = makeHarness({ pages: [[acad({ admissionNumber: null })]] });
    const run = await h.firstImport();
    expect(h.mocks.studentsService.create).not.toHaveBeenCalled();
    expect(run.counts.skipped).toBe(1);
    expect(issueCodes(run)).toEqual(["NO_ADMISSION_NUMBER"]);
  });

  it("skips a blank admission number too", async () => {
    const h = makeHarness({ pages: [[acad({ admissionNumber: "   " })]] });
    expect(issueCodes(await h.firstImport())).toEqual(["NO_ADMISSION_NUMBER"]);
  });

  it("skips a one-word name instead of inventing a surname", async () => {
    const h = makeHarness({ pages: [[acad({ fullName: "Amina" })]] });
    const run = await h.firstImport();
    expect(h.mocks.studentsService.create).not.toHaveBeenCalled();
    expect(issueCodes(run)).toEqual(["NAME_INCOMPLETE"]);
  });

  it("skips a student with no class", async () => {
    const h = makeHarness({ pages: [[acad({ levelId: null, levelName: null })]] });
    const run = await h.firstImport();
    expect(h.mocks.studentsService.create).not.toHaveBeenCalled();
    expect(issueCodes(run)).toEqual(["NO_CLASS"]);
  });

  it("skips BOTH students when two Academy students share an admission number in one run, after the first", async () => {
    const h = makeHarness({ pages: [[acad({ id: "a1", admissionNumber: "7", parents: [] }), acad({ id: "a2", admissionNumber: "7", fullName: "Other Person", parents: [] })]] });
    const run = await h.firstImport();
    expect(h.mocks.studentsService.create).toHaveBeenCalledTimes(1);
    expect(issueCodes(run)).toEqual(["ADMISSION_NO_CONFLICT"]);
    expect(run.issues[0].academyStudentId).toBe("a2");
  });

  it("will not link a second Academy student to an ERP student already linked to another", async () => {
    const h = makeHarness({ pages: [[acad({ id: "a1", admissionNumber: "7", parents: [] })]] });
    await h.firstImport();
    h.setPages([[acad({ id: "a-other", admissionNumber: "7", fullName: "Someone Else", parents: [] })]]);
    const run = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(issueCodes(run)).toContain("ADMISSION_NO_CONFLICT");
    expect(h.maps.students).toHaveLength(1);
  });

  it("does not bring in a student the Academy already shows as alumni or inactive", async () => {
    const h = makeHarness({ pages: [[acad({ id: "a1", admissionNumber: "1", status: "ALUMNI", parents: [] }), acad({ id: "a2", admissionNumber: "2", status: "INACTIVE", parents: [] })]] });
    const run = await h.firstImport();
    expect(h.mocks.studentsService.create).not.toHaveBeenCalled();
    expect(run.counts).toMatchObject({ skipped: 2, created: 0 });
    expect(run.issues).toHaveLength(0);
  });

  it("keeps going when one student fails, and reports it", async () => {
    const h = makeHarness({ pages: [[acad({ id: "a1", admissionNumber: "1", parents: [] }), acad({ id: "a2", admissionNumber: "2", parents: [] }), acad({ id: "a3", admissionNumber: "3", parents: [] })]] });
    h.failures.createFor.add("2");
    const run = await h.firstImport();
    expect(run.status).toBe("SUCCEEDED");
    expect(run.counts).toMatchObject({ created: 3, errors: 1 }); // 'created' counted at the decision; the error is what failed
    expect(h.erp.students.size).toBe(2);
    expect(run.issues).toEqual([expect.objectContaining({ code: "ERROR", academyStudentId: "a2", message: expect.stringContaining("boom for 2") })]);
  });

  it("finishes a half-done student next run if guardian linking failed", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    h.failures.linkGuardian = true;
    const first = await h.firstImport();
    expect(first.counts.errors).toBe(1);
    expect(h.maps.students[0].lastHash).toBe("pending"); // not marked as applied

    h.failures.linkGuardian = false;
    const second = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(second.counts).toMatchObject({ updated: 1, unchanged: 0, errors: 0 });
    expect(h.erp.links).toHaveLength(1);
    expect(h.maps.students[0].lastHash).toBe(fingerprintStudent(acad()));
    expect(h.mocks.studentsService.create).toHaveBeenCalledTimes(1);
  });
});

describe("AcademySyncService — what it must NOT change on a linked student", () => {
  it("updates the name only", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    h.setPages([[acad({ fullName: "Amina Njeri Kamau", updatedAt: "2026-11-02T10:00:00.000Z" })]]);
    const run = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(run.counts.updated).toBe(1);
    expect(h.mocks.studentsService.update).toHaveBeenCalledWith(expect.any(String), { firstName: "Amina", middleName: "Njeri", lastName: "Kamau" }, "admin-1");
  });

  it("reports a status change to alumni and leaves the ERP status alone", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    h.setPages([[acad({ status: "ALUMNI", updatedAt: "2026-11-02T10:00:00.000Z" })]]);
    const run = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(issueCodes(run)).toContain("STATUS_CHANGED");
    expect(Object.keys(h.mocks.studentsService)).not.toContain("changeStatus");
    expect([...h.erp.students.values()][0].status).toBe("ACTIVE");
  });

  it("reports an admission-number change and never rewrites the ERP's", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    h.setPages([[acad({ admissionNumber: "9999", updatedAt: "2026-11-02T10:00:00.000Z" })]]);
    const run = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(issueCodes(run)).toContain("ADMISSION_NO_CHANGED");
    expect([...h.erp.students.values()][0].admissionNo).toBe("1001");
    expect(h.mocks.studentsService.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ admissionNo: expect.anything() }), expect.anything());
  });

  it("reports a class change and does not move the student", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    const originalClass = [...h.erp.students.values()][0].classId;
    h.erp.classes.push({ id: "erp-grade-5", name: "Grade 5", level: 5 });
    h.setPages([[acad({ levelId: "L5", levelName: "Grade 5", updatedAt: "2026-11-02T10:00:00.000Z" })]]);
    const run = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(issueCodes(run)).toContain("CLASS_MISMATCH");
    expect([...h.erp.students.values()][0].classId).toBe(originalClass);
    expect(h.mocks.studentsService.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ classId: expect.anything() }), expect.anything());
  });

  it("flags a student removed in the Academy and keeps the ERP student", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    h.setPages([[acad({ deletedAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z" })]]);
    const run = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(run.counts.removed).toBe(1);
    expect(issueCodes(run)).toEqual(["REMOVED_IN_ACADEMY"]);
    expect(h.maps.students[0].removedInAcademy).toBe(true);
    expect(h.erp.students.size).toBe(1);
  });

  it("does not re-report a removal it has already recorded", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    h.setPages([[acad({ deletedAt: "2026-11-03T00:00:00.000Z" })]]);
    await h.run({ mode: "IMPORT", scope: "FULL" });
    const again = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(again.issues).toHaveLength(0);
  });

  it("ignores a removed student it never knew", async () => {
    const h = makeHarness({ pages: [[acad({ deletedAt: "2026-11-03T00:00:00.000Z" })]] });
    const run = await h.firstImport();
    expect(run.counts).toMatchObject({ skipped: 1, created: 0 });
    expect(run.issues).toHaveLength(0);
  });

  it("brings a restored student back into sync", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    h.setPages([[acad({ deletedAt: "2026-11-03T00:00:00.000Z" })]]);
    await h.run({ mode: "IMPORT", scope: "FULL" });
    h.setPages([[acad({ updatedAt: "2026-11-04T10:00:00.000Z" })]]);
    const run = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(run.counts.updated).toBe(1);
    expect(h.maps.students[0].removedInAcademy).toBe(false);
  });
});

describe("AcademySyncService — a full pass notices who disappeared", () => {
  it("reports a linked student the Academy no longer returns, without touching it", async () => {
    const h = makeHarness({ pages: [[acad({ id: "a1", admissionNumber: "1", parents: [] }), acad({ id: "a2", admissionNumber: "2", parents: [] })]] });
    await h.firstImport();
    h.setPages([[acad({ id: "a1", admissionNumber: "1", parents: [] })]]);
    const run = await h.run({ mode: "IMPORT", scope: "FULL" });
    expect(run.counts.missing).toBe(1);
    expect(run.issues).toEqual([expect.objectContaining({ code: "MISSING_FROM_ACADEMY", academyStudentId: "a2" })]);
    expect(h.erp.students.size).toBe(2);
  });

  it("does not do that on an incremental pass (it only sees what changed)", async () => {
    const h = makeHarness({ pages: [[acad({ id: "a1", admissionNumber: "1", parents: [] }), acad({ id: "a2", admissionNumber: "2", parents: [] })]] });
    await h.firstImport();
    h.setPages([[]]);
    const run = await h.run({ mode: "IMPORT", scope: "INCREMENTAL" });
    expect(run.counts.missing).toBe(0);
  });
});

describe("AcademySyncService — failures", () => {
  it("marks the run FAILED and does not advance the state when the Academy cannot be reached", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.preview();
    h.failures.gateway = new Error("Academy Gateway unreachable (ECONNREFUSED)");
    const run = await h.run({ mode: "IMPORT", confirmFirstImport: true });
    expect(run.status).toBe("FAILED");
    expect(run.error).toContain("ECONNREFUSED");
    expect(h.state.firstImportConfirmedAt).toBeNull();
    expect(h.state.lastUpdatedSince).toBeNull();
  });

  it("never lets a failed run block the next one", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    h.failures.gateway = new Error("down");
    await h.preview();
    h.failures.gateway = null;
    await expect(h.preview()).resolves.toMatchObject({ status: "SUCCEEDED" });
  });

  it("caps the stored issues but keeps the true total", async () => {
    const many = Array.from({ length: 520 }, (_, i) => acad({ id: `a${i}`, admissionNumber: null, parents: [] }));
    const h = makeHarness({ pages: [many] });
    const run = await h.preview();
    expect(run.issues).toHaveLength(500);
    expect(run.issuesTotal).toBe(520);
  });
});

describe("AcademySyncService — scheduled runs and the auto-sync switch", () => {
  it("does nothing until the first import is confirmed and automatic sync is on", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    expect(await h.service.runScheduled()).toBeNull();
    await h.firstImport();
    expect(await h.service.runScheduled()).toBeNull(); // confirmed, but auto-sync still off
    expect(h.mocks.client.listStudents).toHaveBeenCalledTimes(2); // only the preview and the import
  });

  it("does nothing when the ERP is not connected", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    await h.service.setAutoSync(true, "admin-1");
    h.setConnected(false);
    expect(await h.service.runScheduled()).toBeNull();
  });

  it("runs incrementally once automatic sync is on, and with no human actor", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    await h.service.setAutoSync(true, "admin-1");
    h.mocks.client.listStudents.mockClear();
    const run = (await h.service.runScheduled()) as Row;
    expect(run).toMatchObject({ mode: "IMPORT", scope: "INCREMENTAL", trigger: "SCHEDULED", requestedBy: null, status: "SUCCEEDED" });
    expect(h.mocks.client.listStudents).toHaveBeenCalledWith("kfe_test_key", expect.objectContaining({ updatedSince: "2026-11-01T10:00:00.000Z" }));
  });

  it("does a full pass when the last one is more than a day old", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    await h.service.setAutoSync(true, "admin-1");
    h.state.lastFullSuccessAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const run = (await h.service.runScheduled()) as Row;
    expect(run.scope).toBe("FULL");
  });

  it("quietly skips when another run is in progress", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    await h.service.setAutoSync(true, "admin-1");
    h.runs.push({ id: "busy", status: "RUNNING" });
    expect(await h.service.runScheduled()).toBeNull();
  });

  it("refuses to switch automatic sync on before the first import is confirmed", async () => {
    const h = makeHarness();
    await expect(h.service.setAutoSync(true, "admin-1")).rejects.toBeInstanceOf(ValidationException);
    await expect(h.service.setAutoSync(false, "admin-1")).resolves.toMatchObject({ autoSyncEnabled: false });
  });
});

describe("AcademySyncService — status", () => {
  it("summarises where things stand", async () => {
    const h = makeHarness({ pages: [[acad()]] });
    await h.firstImport();
    const status = await h.service.getStatus();
    expect(status).toMatchObject({ connected: true, academySchoolCode: "SCH", mappedStudents: 1 });
    expect(status.lastPreview?.mode).toBe("PREVIEW");
    expect(status.lastImport?.mode).toBe("IMPORT");
    expect(status.state.firstImportConfirmedAt).toBeInstanceOf(Date);
  });
});
