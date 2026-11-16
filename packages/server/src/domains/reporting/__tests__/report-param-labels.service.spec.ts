import type { DataSource } from "typeorm";
import { ReportParamLabelsService } from "../application/pdf/report-param-labels.service";

const STUDENT_ID = "0190b2c4-1111-7222-8333-444455556666";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("ReportParamLabelsService", () => {
  let service: ReportParamLabelsService;
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn(async () => []);
    service = new ReportParamLabelsService({ query } as unknown as DataSource);
  });

  it("resolves a student id to a name + admission number — what makes a statement say whose it is", async () => {
    query.mockResolvedValue([{ v: "Eric Mwangi (254)" }]);

    const lines = await service.describe({ studentId: "uuid" }, { studentId: STUDENT_ID });

    expect(lines).toEqual([{ label: "Student", value: "Eric Mwangi (254)" }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM app.std_student"), [STUDENT_ID]);
  });

  it("qualifies EVERY table with the `app` schema — the app sets no search_path, so an unqualified name fails at runtime and the lookup would silently vanish", async () => {
    query.mockResolvedValue([{ v: "x" }]);
    const allIdKeys = [
      "studentId", "walletId", "supplierId", "bankAccountId", "accountId", "periodId", "fromPeriodId", "toPeriodId", "termId",
      "academicYearId", "runId", "routeId", "storeId", "categoryId", "stockTakeId", "depreciationRunId", "actorId",
    ];

    await service.describe(Object.fromEntries(allIdKeys.map((k) => [k, "uuid" as const])), Object.fromEntries(allIdKeys.map((k) => [k, STUDENT_ID])));

    expect(query).toHaveBeenCalledTimes(allIdKeys.length);
    for (const [sql] of query.mock.calls as [string][]) {
      const tableRefs = [...sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_.]+)/gi)].map((m) => m[1]);
      expect(tableRefs.length).toBeGreaterThan(0);
      for (const table of tableRefs) expect(table).toMatch(/^app\./);
    }
  });

  it("formats dates like the report body and prints strings/numbers as given, in the report's own order", async () => {
    query.mockResolvedValue([{ v: "Eric Mwangi (254)" }]);

    const lines = await service.describe(
      { fromDate: "date", studentId: "uuid", status: "string", limit: "number", toDate: "date" },
      { fromDate: "2026-07-01", studentId: STUDENT_ID, status: "ACTIVE", limit: 50, toDate: "2026-07-31" },
      "Africa/Nairobi",
    );

    expect(lines).toEqual([
      { label: "From date", value: "1 Jul 2026" },
      { label: "Student", value: "Eric Mwangi (254)" },
      { label: "Status", value: "ACTIVE" },
      { label: "Limit", value: "50" },
      { label: "To date", value: "31 Jul 2026" },
    ]);
  });

  it("skips empty / absent parameters", async () => {
    const lines = await service.describe(
      { fromDate: "date", status: "string", note: "string", studentId: "uuid" },
      { fromDate: undefined, status: "", note: null },
    );
    expect(lines).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("never prints a raw id: an unknown id key, a deleted record and a failed lookup are all left off", async () => {
    query.mockImplementation(async (_sql: string, [id]: [string]) => {
      if (id === "gone") return []; // record no longer exists
      throw new Error('invalid input syntax for type uuid: "garbage"');
    });

    const lines = await service.describe(
      { entityId: "uuid", supplierId: "uuid", bankAccountId: "uuid" },
      { entityId: STUDENT_ID, supplierId: "gone", bankAccountId: "garbage" },
    );

    expect(lines).toEqual([]);
    // entityId has no lookup at all, so it is never even queried
    expect(query).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(lines)).not.toMatch(UUID);
  });

  it("keeps resolving the other parameters when one lookup fails", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("std_student")) throw new Error("boom");
      return [{ v: "Term 3 · 2026" }];
    });

    const lines = await service.describe({ studentId: "uuid", termId: "uuid" }, { studentId: STUDENT_ID, termId: "t1" });

    expect(lines).toEqual([{ label: "Term", value: "Term 3 · 2026" }]);
  });

  it("labels the period parameters distinctly (income statement takes a from and a to period)", async () => {
    query.mockResolvedValueOnce([{ v: "01 Jul 2026 – 31 Jul 2026" }]).mockResolvedValueOnce([{ v: "01 Sep 2026 – 30 Sep 2026" }]);

    const lines = await service.describe({ fromPeriodId: "uuid", toPeriodId: "uuid" }, { fromPeriodId: "p1", toPeriodId: "p2" });

    expect(lines).toEqual([
      { label: "From period", value: "01 Jul 2026 – 31 Jul 2026" },
      { label: "To period", value: "01 Sep 2026 – 30 Sep 2026" },
    ]);
  });

  it("resolves the generating user's display name", async () => {
    query.mockResolvedValue([{ v: "John Havy" }]);
    await expect(service.userDisplayName("u1")).resolves.toBe("John Havy");

    query.mockResolvedValue([]);
    await expect(service.userDisplayName("u1")).resolves.toBeNull();
  });
});
