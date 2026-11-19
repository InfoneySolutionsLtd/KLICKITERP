import { DataSource, EntityManager } from "typeorm";
import { BulkBillingService } from "../application/bulk-billing.service";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";

const TARGET_TERM = { id: "term-2", academicYearId: "year-1", seq: 2, name: "Term 2" };
const PRECEDING_TERM = { id: "term-1", academicYearId: "year-1", seq: 1, name: "Term 1" };

/** A full student row (production rows are `StdStudentEntity`s, so they always carry a name). */
const S1 = { id: "s1", streamId: null, firstName: "Amina", lastName: "Otieno", admissionNo: "ADM-001" };
const S1_LABEL = "Amina Otieno (ADM-001)";

function makeStructureLine(overrides: Partial<{ feeCategoryId: string; dueDate: string; amount: Money }> = {}) {
  return { feeCategoryId: "cat-tuition", dueDate: "2026-05-01", amount: Money.fromInt(1000), ...overrides };
}

function makeInvoiceLine(overrides: Partial<{ feeCategoryId: string }> = {}) {
  return { feeCategoryId: "cat-tuition", ...overrides };
}

describe("BulkBillingService", () => {
  let studentRepository: { list: jest.Mock };
  let invoiceRepository: { findMostRecentNonVoidByStudentAndTerm: jest.Mock };
  let invoiceLineRepository: { listByInvoice: jest.Mock; listAlreadyBilledCategoryIds: jest.Mock };
  let feeStructureLineRepository: { listByStructureAndTerm: jest.Mock };
  let feeCategoryRepository: { findByIdOrFail: jest.Mock };
  let feeStructuresService: { findApplicableFor: jest.Mock };
  let academicCalendarService: { findTermByIdOrFail: jest.Mock; findTermByYearAndSeq: jest.Mock };
  let invoicingService: { generateInvoice: jest.Mock; postInvoice: jest.Mock };
  let dataSource: DataSource;
  let service: BulkBillingService;

  beforeEach(() => {
    studentRepository = { list: jest.fn(async () => [[S1], 1]) };
    invoiceRepository = {
      findMostRecentNonVoidByStudentAndTerm: jest.fn(async () => ({ id: "prior-invoice-1", number: "INV-000001" })),
    };
    invoiceLineRepository = {
      listByInvoice: jest.fn(async () => [makeInvoiceLine()]),
      listAlreadyBilledCategoryIds: jest.fn(async () => new Set<string>()),
    };
    feeStructureLineRepository = {
      listByStructureAndTerm: jest.fn(async () => [makeStructureLine()]),
    };
    feeCategoryRepository = {
      findByIdOrFail: jest.fn(async (id: string) => ({ id, name: `Category ${id}` })),
    };
    feeStructuresService = {
      findApplicableFor: jest.fn(async () => ({ id: "structure-1" })),
    };
    academicCalendarService = {
      findTermByIdOrFail: jest.fn(async () => TARGET_TERM),
      findTermByYearAndSeq: jest.fn(async () => PRECEDING_TERM),
    };
    invoicingService = {
      generateInvoice: jest.fn(async (_em, input) => ({ id: `invoice-${input.studentId}-${input.dueDate}` })),
      postInvoice: jest.fn(async () => undefined),
    };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new BulkBillingService(
      dataSource,
      studentRepository as never,
      invoiceRepository as never,
      invoiceLineRepository as never,
      feeStructureLineRepository as never,
      feeCategoryRepository as never,
      feeStructuresService as never,
      academicCalendarService as never,
      invoicingService as never,
    );
  });

  it("happy path — carries forward one category in one due-date group", async () => {
    const result = await service.bulkGenerate("term-2", {}, "initiator-1");

    expect(academicCalendarService.findTermByYearAndSeq).toHaveBeenCalledWith("year-1", 1);
    expect(invoiceRepository.findMostRecentNonVoidByStudentAndTerm).toHaveBeenCalledWith("s1", "term-1", expect.anything());
    expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(1);
    expect(invoicingService.generateInvoice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ studentId: "s1", termId: "term-2", source: "CARRIED_FORWARD" }),
    );
    expect(invoicingService.postInvoice).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toEqual([
      { studentId: "s1", invoiceIds: ["invoice-s1-2026-05-01"], categoryIds: ["cat-tuition"] },
    ]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("carried-forward categories spanning two current due dates produce two invoices", async () => {
    invoiceLineRepository.listByInvoice.mockResolvedValue([
      makeInvoiceLine({ feeCategoryId: "cat-tuition" }),
      makeInvoiceLine({ feeCategoryId: "cat-transport" }),
    ]);
    feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
      makeStructureLine({ feeCategoryId: "cat-tuition", dueDate: "2026-05-01" }),
      makeStructureLine({ feeCategoryId: "cat-transport", dueDate: "2026-06-01" }),
    ]);

    const result = await service.bulkGenerate("term-2", {}, "initiator-1");

    expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(2);
    expect(result.succeeded[0].invoiceIds).toHaveLength(2);
  });

  it("a carried-forward category missing from the current structure fails loudly, naming the category", async () => {
    invoiceLineRepository.listByInvoice.mockResolvedValue([makeInvoiceLine({ feeCategoryId: "cat-swimming" })]);
    feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([makeStructureLine({ feeCategoryId: "cat-tuition" })]);

    const result = await service.bulkGenerate("term-2", {}, "initiator-1");

    expect(result.succeeded).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].studentId).toBe("s1");
    expect(result.failed[0].studentLabel).toBe(S1_LABEL);
    expect(result.failed[0].error).toContain("Category cat-swimming");
    // Reads in names, not ids: the preceding/target TERM names and the prior invoice's number.
    expect(result.failed[0].error).toBe(
      "This student's most recent invoice (INV-000001) from Term 1 billed categories that are no longer on the Term 2 fee structure: Category cat-swimming",
    );
    expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
  });

  it("no applicable current PUBLISHED structure -> failed with the BR-BILL-02 message shape", async () => {
    feeStructuresService.findApplicableFor.mockResolvedValue(null);

    const result = await service.bulkGenerate("term-2", {}, "initiator-1");

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toContain("BR-BILL-02");
    expect(result.failed[0].studentLabel).toBe(S1_LABEL);
    // Names the term; carries no raw term/student id (the old message embedded `student=<id> term=<id>`).
    expect(result.failed[0].error).toContain("Term 2");
    expect(result.failed[0].error).not.toContain("term-2");
    expect(result.failed[0].error).not.toContain("student=");
  });

  it("no non-VOID invoice in the preceding term -> skipped, not failed", async () => {
    invoiceRepository.findMostRecentNonVoidByStudentAndTerm.mockResolvedValue(null);

    const result = await service.bulkGenerate("term-2", {}, "initiator-1");

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([
      { studentId: "s1", studentLabel: S1_LABEL, reason: expect.stringContaining("no non-VOID invoice") },
    ]);
  });

  it("every carried-forward category already billed this term -> full skip", async () => {
    invoiceLineRepository.listAlreadyBilledCategoryIds.mockResolvedValue(new Set(["cat-tuition"]));

    const result = await service.bulkGenerate("term-2", {}, "initiator-1");

    expect(result.succeeded).toEqual([]);
    expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([{ studentId: "s1", studentLabel: S1_LABEL, reason: expect.stringContaining("already billed") }]);
  });

  it("partial already-billed skip still generates for the remaining categories and surfaces which were skipped", async () => {
    invoiceLineRepository.listByInvoice.mockResolvedValue([
      makeInvoiceLine({ feeCategoryId: "cat-tuition" }),
      makeInvoiceLine({ feeCategoryId: "cat-transport" }),
    ]);
    feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
      makeStructureLine({ feeCategoryId: "cat-tuition", dueDate: "2026-05-01" }),
      makeStructureLine({ feeCategoryId: "cat-transport", dueDate: "2026-05-01" }),
    ]);
    invoiceLineRepository.listAlreadyBilledCategoryIds.mockResolvedValue(new Set(["cat-transport"]));

    const result = await service.bulkGenerate("term-2", {}, "initiator-1");

    expect(result.succeeded).toEqual([
      {
        studentId: "s1",
        invoiceIds: ["invoice-s1-2026-05-01"],
        categoryIds: ["cat-tuition", "cat-transport"],
        alreadyBilledCategoryIds: ["cat-transport"],
      },
    ]);
  });

  it("a mixed batch: one succeeds, one fails on a missing category, one is skipped — later students unaffected", async () => {
    studentRepository.list.mockResolvedValue([[{ id: "s1" }, { id: "s2" }, { id: "s3" }], 3]);
    invoiceRepository.findMostRecentNonVoidByStudentAndTerm.mockImplementation(async (studentId: string) => {
      if (studentId === "s3") return null;
      return { id: `prior-${studentId}`, number: `INV-${studentId}` };
    });
    invoiceLineRepository.listByInvoice.mockImplementation(async (invoiceId: string) => {
      if (invoiceId === "prior-s2") return [makeInvoiceLine({ feeCategoryId: "cat-missing" })];
      return [makeInvoiceLine({ feeCategoryId: "cat-tuition" })];
    });

    const result = await service.bulkGenerate("term-2", {}, "initiator-1");

    expect(result.succeeded.map((s) => s.studentId)).toEqual(["s1"]);
    expect(result.failed.map((f) => f.studentId)).toEqual(["s2"]);
    expect(result.skipped.map((s) => s.studentId)).toEqual(["s3"]);
  });

  describe("tells whoever started the run how it went (the bell)", () => {
    function withSink() {
      const sink = { emit: jest.fn(async () => 1) };
      const svc = new BulkBillingService(
        dataSource,
        studentRepository as never,
        invoiceRepository as never,
        invoiceLineRepository as never,
        feeStructureLineRepository as never,
        feeCategoryRepository as never,
        feeStructuresService as never,
        academicCalendarService as never,
        invoicingService as never,
        sink as never,
      );
      return { sink, svc };
    }

    it("raises BULK_BILLING_DONE for the initiator ONLY, with the created / skipped / failed counts and the term", async () => {
      studentRepository.list.mockResolvedValue([[{ id: "s1" }, { id: "s2" }, { id: "s3" }], 3]);
      invoiceRepository.findMostRecentNonVoidByStudentAndTerm.mockImplementation(async (studentId: string) => (studentId === "s3" ? null : { id: `prior-${studentId}`, number: `INV-${studentId}` }));
      invoiceLineRepository.listByInvoice.mockImplementation(async (invoiceId: string) => [makeInvoiceLine({ feeCategoryId: invoiceId === "prior-s2" ? "cat-missing" : "cat-tuition" })]);
      const { sink, svc } = withSink();

      await svc.bulkGenerate("term-2", {}, "initiator-1");

      expect(sink.emit).toHaveBeenCalledTimes(1);
      expect(sink.emit).toHaveBeenCalledWith({
        code: "BULK_BILLING_DONE",
        params: { term: TARGET_TERM.name, created: 1, skipped: 1, failed: 1 },
        link: "/billing/bulk-billing",
        entityType: "set_term",
        entityId: "term-2",
        userIds: ["initiator-1"],
      });
    });

    it("a request refused up front (no earlier term) tells nobody anything", async () => {
      academicCalendarService.findTermByIdOrFail.mockResolvedValue({ ...TARGET_TERM, seq: 1 });
      academicCalendarService.findTermByYearAndSeq.mockResolvedValue(null);
      const { sink, svc } = withSink();
      await expect(svc.bulkGenerate("term-2", {}, "initiator-1")).rejects.toBeInstanceOf(NotFoundException);
      expect(sink.emit).not.toHaveBeenCalled();
    });

    it("an empty run is still reported (0 created, 0 skipped, 0 failed) so the person knows it finished", async () => {
      studentRepository.list.mockResolvedValue([[], 0]);
      const { sink, svc } = withSink();
      await svc.bulkGenerate("term-2", {}, "initiator-1");
      expect((sink.emit.mock.calls[0] as unknown as [{ params: object }])[0].params).toEqual({ term: TARGET_TERM.name, created: 0, skipped: 0, failed: 0 });
    });
  });

  it("target term seq=1 (no possible predecessor) rejects the whole request up front — no student ever touched", async () => {
    academicCalendarService.findTermByIdOrFail.mockResolvedValue({ ...TARGET_TERM, seq: 1 });
    academicCalendarService.findTermByYearAndSeq.mockResolvedValue(null);

    await expect(service.bulkGenerate("term-2", {}, "initiator-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(studentRepository.list).not.toHaveBeenCalled();
    expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
  });

  it("the up-front 'no preceding term' rejection names the term and carries no academic-year id or seq internals", async () => {
    academicCalendarService.findTermByYearAndSeq.mockResolvedValue(null);

    const error = await service.bulkGenerate("term-2", {}, "initiator-1").catch((e: Error) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(
      "Preceding term not found: Term 2 has no earlier term in its academic year, so there are no invoices to carry forward from",
    );
    expect((error as Error).message).not.toContain("year-1");
    expect((error as Error).message).not.toContain("seq");
  });

  it("seq>1 but the seq-1 term row genuinely doesn't exist — same up-front rejection", async () => {
    academicCalendarService.findTermByYearAndSeq.mockResolvedValue(null);

    await expect(service.bulkGenerate("term-2", {}, "initiator-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(studentRepository.list).not.toHaveBeenCalled();
  });

  it("re-running the same scope is idempotent — a second run skips what the first already billed", async () => {
    invoiceLineRepository.listAlreadyBilledCategoryIds
      .mockResolvedValueOnce(new Set<string>())
      .mockResolvedValueOnce(new Set(["cat-tuition"]));

    const first = await service.bulkGenerate("term-2", {}, "initiator-1");
    const second = await service.bulkGenerate("term-2", {}, "initiator-1");

    expect(first.succeeded).toHaveLength(1);
    expect(second.succeeded).toEqual([]);
    expect(second.skipped).toEqual([{ studentId: "s1", studentLabel: S1_LABEL, reason: expect.stringContaining("already billed") }]);
  });

  describe("resolveStudents() scoping — unchanged from the prior implementation", () => {
    it("bills every ACTIVE student when no filter is given", async () => {
      studentRepository.list.mockResolvedValue([[{ id: "s1" }, { id: "s2" }], 2]);

      await service.bulkGenerate("term-2", {}, "initiator-1");

      expect(studentRepository.list).toHaveBeenCalledWith({ status: "ACTIVE" });
    });

    it("filters by classIds, unioning across multiple classes", async () => {
      studentRepository.list.mockImplementation(async (filter: { classId?: string }) => {
        if (filter.classId === "class-1") return [[{ id: "s1" }], 1];
        if (filter.classId === "class-2") return [[{ id: "s2" }], 1];
        return [[], 0];
      });

      const result = await service.bulkGenerate("term-2", { classIds: ["class-1", "class-2"] }, "initiator-1");

      expect(result.succeeded.map((s) => s.studentId).sort()).toEqual(["s1", "s2"]);
    });

    it("further narrows a classIds filter by streamIds", async () => {
      studentRepository.list.mockResolvedValue([
        [
          { id: "s1", streamId: "stream-A" },
          { id: "s2", streamId: "stream-B" },
        ],
        2,
      ]);

      const result = await service.bulkGenerate(
        "term-2",
        { classIds: ["class-1"], streamIds: ["stream-A"] },
        "initiator-1",
      );

      expect(result.succeeded.map((s) => s.studentId)).toEqual(["s1"]);
    });
  });
});
