import { DataSource, EntityManager } from "typeorm";
import { TransportBillingService, TRANSPORT_FEE_INCOME_CATEGORY_NAME } from "../application/transport-billing.service";
import { Money } from "../../../shared/money/money";

describe("TransportBillingService", () => {
  let transportRouteRepository: { findByIdOrFail: jest.Mock };
  let feeCategoryRepository: { findByName: jest.Mock };
  let invoicingService: { generateInvoice: jest.Mock; postInvoice: jest.Mock };
  let billInvoiceLineRepository: { listByInvoice: jest.Mock };
  let billingLineRepository: { create: jest.Mock };
  let dataSource: DataSource;
  let service: TransportBillingService;

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
    };
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
    );
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
});
