import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { BankFeedImportService } from "../application/bank-feed-import.service";

const EM = {} as EntityManager;

describe("BankFeedImportService", () => {
  let resolver: { resolveForAccount: jest.Mock };
  let statementImportService: { list: jest.Mock; importLines: jest.Mock };
  let filesService: { upload: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: BankFeedImportService;

  beforeEach(() => {
    resolver = { resolveForAccount: jest.fn() };
    statementImportService = {
      list: jest.fn(async () => []),
      importLines: jest.fn(async () => ({ import: { id: "import-1" }, insertedCount: 2, duplicateCount: 0 })),
    };
    filesService = { upload: jest.fn(async () => ({ id: "file-1" })) };
    dataSource = { transaction: jest.fn((_level: string, work: (em: EntityManager) => Promise<unknown>) => work(EM)) };

    service = new BankFeedImportService(resolver as never, statementImportService as never, filesService as never, dataSource as never);
  });

  it("throws ValidationException when no BANK config is set up for this account", async () => {
    resolver.resolveForAccount.mockResolvedValue(null);
    await expect(service.fetchAndImport("acc-1", "user-1")).rejects.toBeInstanceOf(ValidationException);
    expect(filesService.upload).not.toHaveBeenCalled();
  });

  it("fetches transactions, uploads a synthetic file, and imports via the shared dedupe/insert path", async () => {
    const adapter = { fetchTransactions: jest.fn(async () => [{ date: "2026-02-01", description: "Deposit", amount: "500.0000" }]) };
    resolver.resolveForAccount.mockResolvedValue({ adapter, configId: "config-1" });

    const result = await service.fetchAndImport("acc-1", "user-1");

    expect(adapter.fetchTransactions).toHaveBeenCalled();
    expect(filesService.upload).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedByUserId: "user-1", mime: "application/json" }),
    );
    expect(statementImportService.importLines).toHaveBeenCalledWith(
      EM,
      expect.objectContaining({
        accountId: "acc-1",
        fileId: "file-1",
        rawRows: [{ date: "2026-02-01", description: "Deposit", amount: "500.0000", ref: undefined }],
      }),
    );
    expect(result.insertedCount).toBe(2);
  });

  it("reclassifies a real network failure from the adapter into a clean ValidationException, never a raw 500", async () => {
    const adapter = { fetchTransactions: jest.fn(async () => { throw new Error("Connection timed out after 10000ms"); }) };
    resolver.resolveForAccount.mockResolvedValue({ adapter, configId: "config-1" });

    await expect(service.fetchAndImport("acc-1", "user-1")).rejects.toBeInstanceOf(ValidationException);
    expect(filesService.upload).not.toHaveBeenCalled();
  });

  it("uses the most recent prior import's date as the fetch window start, falling back to a lookback when none exists", async () => {
    const adapter = { fetchTransactions: jest.fn(async () => []) };
    resolver.resolveForAccount.mockResolvedValue({ adapter, configId: "config-1" });
    statementImportService.list.mockResolvedValue([
      { importedAt: new Date("2026-01-01T00:00:00Z") },
      { importedAt: new Date("2026-02-15T00:00:00Z") },
    ]);

    await service.fetchAndImport("acc-1", "user-1");

    expect(adapter.fetchTransactions).toHaveBeenCalledWith("2026-02-15");
  });
});
