import { DataSource, EntityManager } from "typeorm";
import { TransportBillingService, TRANSPORT_FEE_INCOME_CATEGORY_NAME } from "../application/transport-billing.service";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";

const TARGET_TERM = { id: "term-2", academicYearId: "year-1", seq: 2, name: "Term 2" };
const PRECEDING_TERM = { id: "term-1", academicYearId: "year-1", seq: 1, name: "Term 1" };

describe("TransportBillingService", () => {
  let transportRouteRepository: { findByIdOrFail: jest.Mock };
  let feeCategoryRepository: { findByName: jest.Mock };
  let invoicingService: { generateInvoice: jest.Mock; postInvoice: jest.Mock };
  let billInvoiceLineRepository: { listByInvoice: jest.Mock };
  let billingLineRepository: { create: jest.Mock; listByTermAndOptionalRoute: jest.Mock };
  let academicCalendarService: { findTermByIdOrFail: jest.Mock; findTermByYearAndSeq: jest.Mock };
  let studentRepository: { findByIds: jest.Mock };
  let dataSource: DataSource;
  let service: TransportBillingService;

  /** `StdStudentRepository.findByIds()` result rows — production rows are `StdStudentEntity`s, so they always carry a name. */
  const studentRow = (id: string, firstName: string, lastName: string, admissionNo: string) => ({ id, firstName, lastName, admissionNo });

  beforeEach(() => {
    transportRouteRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "route-1", name: "Route A", amount: Money.fromInt(500) })),
    };
    feeCategoryRepository = {
      findByName: jest.fn(async () => ({ id: "cat-transport" })),
    };
    invoicingService = {
      generateInvoice: jest.fn(async (_em, input) => ({ id: `invoice-${input.studentId}` })),
      postInvoice: jest.fn(async () => undefined),
    };
    billInvoiceLineRepository = {
      listByInvoice: jest.fn(async (invoiceId: string) => [{ id: `${invoiceId}-line-1` }]),
    };
    billingLineRepository = {
      create: jest.fn(async () => undefined),
      listByTermAndOptionalRoute: jest.fn(async (termId: string) => {
        if (termId === PRECEDING_TERM.id) {
          return [{ studentId: "s1", routeId: "route-1", createdAt: new Date("2026-01-01") }];
        }
        return [];
      }),
    };
    academicCalendarService = {
      findTermByIdOrFail: jest.fn(async () => TARGET_TERM),
      findTermByYearAndSeq: jest.fn(async () => PRECEDING_TERM),
    };
    // Default: no student rows found, so results carry no `studentLabel` and every
    // pre-existing exact-match assertion below stays valid; the labelling tests override this.
    studentRepository = { findByIds: jest.fn(async () => []) };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new TransportBillingService(
      dataSource,
      transportRouteRepository as never,
      feeCategoryRepository as never,
      invoicingService as never,
      billInvoiceLineRepository as never,
      billingLineRepository as never,
      academicCalendarService as never,
      studentRepository as never,
    );
  });

  describe("student labels in results", () => {
    it("billStudents() labels succeeded AND failed entries with the student's name, from ONE lookup for the whole batch", async () => {
      studentRepository.findByIds.mockResolvedValue([
        studentRow("s1", "Amina", "Otieno", "ADM-001"),
        studentRow("s2", "Brian", "Kamau", "ADM-002"),
      ]);
      invoicingService.generateInvoice.mockImplementation(async (_em, input) => {
        if (input.studentId === "s2") throw new Error("no active postable AR_STUDENT account");
        return { id: `invoice-${input.studentId}` };
      });

      const result = await service.billStudents({ routeId: "route-1", termId: "term-1", studentIds: ["s1", "s2"] }, "initiator-1");

      expect(studentRepository.findByIds).toHaveBeenCalledTimes(1);
      expect(studentRepository.findByIds).toHaveBeenCalledWith(["s1", "s2"]);
      expect(result.succeeded).toEqual([{ studentId: "s1", studentLabel: "Amina Otieno (ADM-001)", invoiceIds: ["invoice-s1"] }]);
      expect(result.failed).toEqual([
        { studentId: "s2", studentLabel: "Brian Kamau (ADM-002)", error: "no active postable AR_STUDENT account" },
      ]);
    });

    it("a failed name lookup never fails the billing run — invoices are still generated and results simply carry no label", async () => {
      studentRepository.findByIds.mockRejectedValue(new Error("connection reset"));

      const result = await service.billStudents({ routeId: "route-1", termId: "term-1", studentIds: ["s1"] }, "initiator-1");

      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(1);
      expect(result.succeeded).toEqual([{ studentId: "s1", invoiceIds: ["invoice-s1"] }]);
      expect(result.succeeded[0].studentLabel).toBeUndefined();
    });

    it("regenerateLikePreviousTerm() labels failed and skipped entries", async () => {
      billingLineRepository.listByTermAndOptionalRoute.mockImplementation(async (termId: string) => {
        if (termId === "term-1") {
          return [
            { studentId: "s1", routeId: "route-1", createdAt: new Date("2026-01-01") },
            { studentId: "s2", routeId: "route-1", createdAt: new Date("2026-01-01") },
            { studentId: "s3", routeId: "route-1", createdAt: new Date("2026-01-01") },
          ];
        }
        return [{ studentId: "s3", routeId: "route-1", createdAt: new Date("2026-05-01") }];
      });
      studentRepository.findByIds.mockResolvedValue([
        studentRow("s1", "Amina", "Otieno", "ADM-001"),
        studentRow("s2", "Brian", "Kamau", "ADM-002"),
        studentRow("s3", "Chebet", "Rono", "ADM-003"),
      ]);
      invoicingService.generateInvoice.mockImplementation(async (_em, input) => {
        if (input.studentId === "s2") throw new Error("no active postable AR_STUDENT account");
        return { id: `invoice-${input.studentId}` };
      });

      const result = await service.regenerateLikePreviousTerm("term-2", {}, "initiator-1");

      expect(studentRepository.findByIds).toHaveBeenCalledTimes(1);
      expect(result.failed).toEqual([
        { studentId: "s2", studentLabel: "Brian Kamau (ADM-002)", error: "no active postable AR_STUDENT account" },
      ]);
      expect(result.skipped).toEqual([
        { studentId: "s3", studentLabel: "Chebet Rono (ADM-003)", reason: expect.stringContaining("already billed") },
      ]);
    });
  });

  it("bills each selected student one ADHOC invoice for the route's flat amount, tagged to the designated Transport Fee category", async () => {
    const result = await service.billStudents(
      { routeId: "route-1", termId: "term-1", studentIds: ["s1", "s2"] },
      "initiator-1",
    );

    expect(result.succeeded).toEqual([
      { studentId: "s1", invoiceIds: ["invoice-s1"] },
      { studentId: "s2", invoiceIds: ["invoice-s2"] },
    ]);
    expect(result.failed).toEqual([]);
    expect(feeCategoryRepository.findByName).toHaveBeenCalledWith(TRANSPORT_FEE_INCOME_CATEGORY_NAME);
    expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(2);
    expect(invoicingService.generateInvoice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        studentId: "s1",
        termId: "term-1",
        source: "ADHOC",
        adhocLines: [{ feeCategoryId: "cat-transport", description: "Transport fee — Route A", amount: expect.anything() }],
      }),
    );
    expect(invoicingService.postInvoice).toHaveBeenCalledTimes(2);
  });

  it("records one bill_transport_billing_line row per resulting invoice line, tagged to the route and student", async () => {
    billInvoiceLineRepository.listByInvoice.mockResolvedValueOnce([{ id: "line-a" }, { id: "line-b" }]);

    await service.billStudents({ routeId: "route-1", termId: "term-1", studentIds: ["s1"] }, "initiator-1");

    expect(billingLineRepository.create).toHaveBeenCalledTimes(2);
    expect(billingLineRepository.create).toHaveBeenCalledWith(
      { routeId: "route-1", invoiceLineId: "line-a", studentId: "s1" },
      expect.anything(),
    );
    expect(billingLineRepository.create).toHaveBeenCalledWith(
      { routeId: "route-1", invoiceLineId: "line-b", studentId: "s1" },
      expect.anything(),
    );
  });

  it("one student's failure never aborts the batch — a real per-student-own-transaction proof", async () => {
    invoicingService.generateInvoice.mockImplementation(async (_em, input) => {
      if (input.studentId === "s2") throw new Error("no active postable AR_STUDENT account");
      return { id: `invoice-${input.studentId}` };
    });

    const result = await service.billStudents(
      { routeId: "route-1", termId: "term-1", studentIds: ["s1", "s2", "s3"] },
      "initiator-1",
    );

    expect(result.succeeded.map((r) => r.studentId).sort()).toEqual(["s1", "s3"]);
    expect(result.failed).toEqual([{ studentId: "s2", error: "no active postable AR_STUDENT account" }]);
  });

  it("throws when the Transport Fee category has not been seeded (migration 0245 not applied)", async () => {
    feeCategoryRepository.findByName.mockResolvedValueOnce(null);

    await expect(
      service.billStudents({ routeId: "route-1", termId: "term-1", studentIds: ["s1"] }, "initiator-1"),
    ).rejects.toThrow(/Transport Fee/);
    expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
  });

  describe("regenerateLikePreviousTerm()", () => {
    it("carries forward the student's route from the preceding term, priced at the CURRENT route amount", async () => {
      const result = await service.regenerateLikePreviousTerm("term-2", {}, "initiator-1");

      expect(academicCalendarService.findTermByYearAndSeq).toHaveBeenCalledWith("year-1", 1);
      expect(billingLineRepository.listByTermAndOptionalRoute).toHaveBeenCalledWith("term-1", undefined);
      expect(invoicingService.generateInvoice).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          studentId: "s1",
          termId: "term-2",
          source: "CARRIED_FORWARD",
          adhocLines: [
            expect.objectContaining({ feeCategoryId: "cat-transport", amount: Money.fromInt(500) }),
          ],
        }),
      );
      expect(result.succeeded).toEqual([{ studentId: "s1", invoiceIds: ["invoice-s1"], routeId: "route-1" }]);
      expect(result.failed).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it("prices at the route's CURRENT amount, not any prior amount — repricing proof", async () => {
      transportRouteRepository.findByIdOrFail.mockResolvedValue({ id: "route-1", name: "Route A", amount: Money.fromInt(750) });

      await service.regenerateLikePreviousTerm("term-2", {}, "initiator-1");

      expect(invoicingService.generateInvoice).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ adhocLines: [expect.objectContaining({ amount: Money.fromInt(750) })] }),
      );
    });

    it("skips a student already billed for transport this target term", async () => {
      billingLineRepository.listByTermAndOptionalRoute.mockImplementation(async (termId: string) => {
        if (termId === "term-1") return [{ studentId: "s1", routeId: "route-1", createdAt: new Date("2026-01-01") }];
        return [{ studentId: "s1", routeId: "route-1", createdAt: new Date("2026-05-01") }];
      });

      const result = await service.regenerateLikePreviousTerm("term-2", {}, "initiator-1");

      expect(result.succeeded).toEqual([]);
      expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
      expect(result.skipped).toEqual([{ studentId: "s1", reason: expect.stringContaining("already billed") }]);
    });

    it("a student with no prior-term transport billing is simply absent from the run — not a failure", async () => {
      billingLineRepository.listByTermAndOptionalRoute.mockResolvedValue([]);

      const result = await service.regenerateLikePreviousTerm("term-2", {}, "initiator-1");

      expect(result.succeeded).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
    });

    it("target term seq=1 (no possible predecessor) rejects the whole request up front — no student ever touched", async () => {
      academicCalendarService.findTermByIdOrFail.mockResolvedValue({ ...TARGET_TERM, seq: 1 });
      academicCalendarService.findTermByYearAndSeq.mockResolvedValue(null);

      await expect(service.regenerateLikePreviousTerm("term-2", {}, "initiator-1")).rejects.toBeInstanceOf(NotFoundException);
      expect(billingLineRepository.listByTermAndOptionalRoute).not.toHaveBeenCalled();
      expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
    });

    it("the up-front 'no preceding term' rejection names the term and carries no academic-year id or seq internals", async () => {
      academicCalendarService.findTermByYearAndSeq.mockResolvedValue(null);

      const error = await service.regenerateLikePreviousTerm("term-2", {}, "initiator-1").catch((e: Error) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(
        "Preceding term not found: Term 2 has no earlier term in its academic year, so there is no transport billing to carry forward from",
      );
      expect((error as Error).message).not.toContain("year-1");
      expect((error as Error).message).not.toContain("seq");
    });

    it("an optional routeId filter narrows the preceding term's population", async () => {
      await service.regenerateLikePreviousTerm("term-2", { routeId: "route-9" }, "initiator-1");

      expect(billingLineRepository.listByTermAndOptionalRoute).toHaveBeenCalledWith("term-1", "route-9");
    });

    it("a mixed batch: one succeeds, one fails, one is skipped — later students unaffected", async () => {
      billingLineRepository.listByTermAndOptionalRoute.mockImplementation(async (termId: string) => {
        if (termId === "term-1") {
          return [
            { studentId: "s1", routeId: "route-1", createdAt: new Date("2026-01-01") },
            { studentId: "s2", routeId: "route-1", createdAt: new Date("2026-01-01") },
            { studentId: "s3", routeId: "route-1", createdAt: new Date("2026-01-01") },
          ];
        }
        return [{ studentId: "s3", routeId: "route-1", createdAt: new Date("2026-05-01") }];
      });
      invoicingService.generateInvoice.mockImplementation(async (_em, input) => {
        if (input.studentId === "s2") throw new Error("no active postable AR_STUDENT account");
        return { id: `invoice-${input.studentId}` };
      });

      const result = await service.regenerateLikePreviousTerm("term-2", {}, "initiator-1");

      expect(result.succeeded.map((r) => r.studentId)).toEqual(["s1"]);
      expect(result.failed.map((f) => f.studentId)).toEqual(["s2"]);
      expect(result.skipped.map((s) => s.studentId)).toEqual(["s3"]);
    });
  });
});
