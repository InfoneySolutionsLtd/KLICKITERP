import { DataSource, EntityManager } from "typeorm";
import { TransportExpenseService, TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME } from "../application/transport-expense.service";
import { Money } from "../../../shared/money/money";

describe("TransportExpenseService", () => {
  let transportRouteRepository: { findByIdOrFail: jest.Mock };
  let expCategoryRepository: { findByName: jest.Mock };
  let vouchersService: { create: jest.Mock };
  let transportExpenseRepository: { create: jest.Mock; listByRoute: jest.Mock; sumAmountByRoute: jest.Mock };
  let transportBillingLineRepository: { sumAmountByRoute: jest.Mock };
  let dataSource: DataSource;
  let service: TransportExpenseService;

  beforeEach(() => {
    transportRouteRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "route-1", name: "Route A" })),
    };
    expCategoryRepository = {
      findByName: jest.fn(async () => ({ id: "cat-vehicle-expense" })),
    };
    vouchersService = {
      create: jest.fn(async () => ({ id: "voucher-1", number: "DRAFT-voucher-1" })),
    };
    transportExpenseRepository = {
      create: jest.fn(async (data: Record<string, unknown>) => ({ id: "link-1", ...data })),
      listByRoute: jest.fn(async () => []),
      sumAmountByRoute: jest.fn(async () => "1500.0000"),
    };
    transportBillingLineRepository = {
      sumAmountByRoute: jest.fn(async () => "5000.0000"),
    };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new TransportExpenseService(
      dataSource,
      transportRouteRepository as never,
      expCategoryRepository as never,
      vouchersService as never,
      transportExpenseRepository as never,
      transportBillingLineRepository as never,
    );
  });

  it("logs a real exp_voucher pinned to the designated Transport/Vehicle Expense category, then links it to the route", async () => {
    const result = await service.logExpense(
      {
        routeId: "route-1",
        payeeType: "SUPPLIER",
        payeeRef: { supplierId: "sup-1" },
        amount: Money.fromInt(2000),
        method: "BANK",
        narrative: "Fuel refill",
      },
      "actor-1",
    );

    expect(transportRouteRepository.findByIdOrFail).toHaveBeenCalledWith("route-1");
    expect(expCategoryRepository.findByName).toHaveBeenCalledWith(TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME);
    expect(vouchersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payeeType: "SUPPLIER",
        payeeRef: { supplierId: "sup-1" },
        categoryId: "cat-vehicle-expense",
        method: "BANK",
        narrative: "Fuel refill",
      }),
      "actor-1",
      expect.anything(),
    );
    expect(transportExpenseRepository.create).toHaveBeenCalledWith(
      { routeId: "route-1", voucherId: "voucher-1" },
      expect.anything(),
    );
    expect(result.expense).toEqual({ id: "link-1", routeId: "route-1", voucherId: "voucher-1" });
    expect(result.voucher).toEqual({ id: "voucher-1", number: "DRAFT-voucher-1" });
  });

  it("throws when the Transport/Vehicle Expense category has not been seeded (migration 0245 not applied)", async () => {
    expCategoryRepository.findByName.mockResolvedValueOnce(null);

    await expect(
      service.logExpense(
        { routeId: "route-1", payeeType: "OTHER", payeeRef: {}, amount: Money.fromInt(100), method: "CASH", narrative: "x" },
        "actor-1",
      ),
    ).rejects.toThrow(/Transport\/Vehicle Expense/);
    expect(vouchersService.create).not.toHaveBeenCalled();
  });

  it("getSummary() returns the income (billed transport lines) vs. expense (logged vouchers) totals for a route", async () => {
    const result = await service.getSummary("route-1");

    expect(transportRouteRepository.findByIdOrFail).toHaveBeenCalledWith("route-1");
    expect(transportBillingLineRepository.sumAmountByRoute).toHaveBeenCalledWith("route-1");
    expect(transportExpenseRepository.sumAmountByRoute).toHaveBeenCalledWith("route-1");
    expect(result).toEqual({ totalIncome: "5000.0000", totalExpense: "1500.0000" });
  });
});
