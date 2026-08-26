import { EntityManager } from "typeorm";
import { AccountingSyncService } from "../application/accounting-sync.service";
import { IntgSyncLogEntity } from "../domain/intg-sync-log.entity";

const EM = {} as EntityManager;

describe("AccountingSyncService", () => {
  let resolver: { resolve: jest.Mock; resolveWithConfigId: jest.Mock };
  let syncLogRepository: { create: jest.Mock; list: jest.Mock };
  let integrationConfigService: { recordTestResult: jest.Mock };
  let adapter: { pushEntity: jest.Mock; testConnection: jest.Mock };
  let service: AccountingSyncService;

  beforeEach(() => {
    adapter = { pushEntity: jest.fn(), testConnection: jest.fn() };
    resolver = {
      resolve: jest.fn(async () => adapter),
      resolveWithConfigId: jest.fn(async () => ({ adapter, configId: "config-1" })),
    };
    syncLogRepository = {
      create: jest.fn(async (data: Partial<IntgSyncLogEntity>) => ({ id: "log-1", ...data }) as IntgSyncLogEntity),
      list: jest.fn(async () => [[], 0]),
    };
    integrationConfigService = { recordTestResult: jest.fn() };
    service = new AccountingSyncService(resolver as never, syncLogRepository as never, integrationConfigService as never);
  });

  describe("pushEntity — log-then-classify", () => {
    it("logs a SUCCESS row with provider_ref when the adapter resolves", async () => {
      adapter.pushEntity.mockResolvedValue({ providerRef: "qb-invoice-145" });

      const logRow = await service.pushEntity(EM, {
        kind: "QUICKBOOKS",
        entityType: "INVOICE",
        entityId: "inv-1",
        payload: { Line: [] },
      });

      expect(resolver.resolve).toHaveBeenCalledWith("QUICKBOOKS");
      expect(adapter.pushEntity).toHaveBeenCalledWith("INVOICE", "PUSH", { Line: [] });
      expect(syncLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "QUICKBOOKS",
          direction: "PUSH",
          entityType: "INVOICE",
          entityId: "inv-1",
          status: "SUCCESS",
          providerRef: "qb-invoice-145",
          error: null,
        }),
        EM,
      );
      expect(logRow.status).toBe("SUCCESS");
    });

    it("logs a FAILED row with the error message when the adapter throws, WITHOUT rethrowing", async () => {
      adapter.pushEntity.mockRejectedValue(new Error("QuickBooks API responded 401: unauthorized"));

      const logRow = await service.pushEntity(EM, {
        kind: "QUICKBOOKS",
        entityType: "INVOICE",
        entityId: "inv-1",
        payload: {},
      });

      expect(syncLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "FAILED",
          providerRef: null,
          error: "QuickBooks API responded 401: unauthorized",
        }),
        EM,
      );
      expect(logRow.status).toBe("FAILED");
    });

    it("always writes exactly one log row regardless of outcome (log-then-classify, not classify-then-maybe-log)", async () => {
      adapter.pushEntity.mockResolvedValueOnce({ providerRef: "ok-1" });
      await service.pushEntity(EM, { kind: "XERO", entityType: "CUSTOMER", entityId: "c-1", payload: {} });

      adapter.pushEntity.mockRejectedValueOnce(new Error("boom"));
      await service.pushEntity(EM, { kind: "XERO", entityType: "CUSTOMER", entityId: "c-2", payload: {} });

      expect(syncLogRepository.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("testConnection", () => {
    it("delegates to the resolved adapter's testConnection() (FR-SET-003.1) and records the result on the resolved config", async () => {
      adapter.testConnection.mockResolvedValue({ ok: true, message: "Connected" });

      const result = await service.testConnection("SAGE");

      expect(resolver.resolveWithConfigId).toHaveBeenCalledWith("SAGE");
      expect(result).toEqual({ ok: true, message: "Connected" });
      expect(integrationConfigService.recordTestResult).toHaveBeenCalledWith("config-1", true);
    });

    it("does not attempt a writeback when no config is enabled (SyncLogOnlyAdapter fallback, configId null)", async () => {
      resolver.resolveWithConfigId.mockResolvedValueOnce({ adapter, configId: null });
      adapter.testConnection.mockResolvedValue({ ok: false, message: "no adapter configured" });

      await service.testConnection("XERO");

      expect(integrationConfigService.recordTestResult).not.toHaveBeenCalled();
    });
  });
});
