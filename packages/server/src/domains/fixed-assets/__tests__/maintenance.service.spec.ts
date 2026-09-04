import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { MaintenanceService } from "../application/maintenance.service";
import { FaAssetEntity } from "../domain/fa-asset.entity";
import { FaMaintenanceEntity } from "../domain/fa-maintenance.entity";

function makeAsset(overrides: Partial<FaAssetEntity> = {}): FaAssetEntity {
  return { id: "asset-1", status: "ACTIVE", ...overrides } as FaAssetEntity;
}

function makeMaintenance(overrides: Partial<FaMaintenanceEntity> = {}): FaMaintenanceEntity {
  return {
    id: "maint-1",
    assetId: "asset-1",
    kind: "REPAIR",
    scheduledOn: null,
    doneOn: null,
    costExpenseVoucherId: null,
    downtimeNote: "",
    ...overrides,
  } as FaMaintenanceEntity;
}

describe("MaintenanceService", () => {
  let maintenanceRepository: { create: jest.Mock; save: jest.Mock; findByIdOrFail: jest.Mock; findByAssetId: jest.Mock };
  let assetRepository: { findByIdOrFail: jest.Mock; save: jest.Mock };
  let service: MaintenanceService;

  const em = {} as EntityManager;

  beforeEach(() => {
    maintenanceRepository = {
      create: jest.fn(async (data) => makeMaintenance(data)),
      save: jest.fn(async (e) => e),
      findByIdOrFail: jest.fn(async () => makeMaintenance()),
      findByAssetId: jest.fn(async () => []),
    };
    assetRepository = {
      findByIdOrFail: jest.fn(async () => makeAsset()),
      save: jest.fn(async (e) => e),
    };
    service = new MaintenanceService(maintenanceRepository as never, assetRepository as never);
  });

  describe("schedule", () => {
    it("flips fa_asset.status to UNDER_MAINTENANCE", async () => {
      await service.schedule(em, { assetId: "asset-1", kind: "REPAIR" }, "user-1");
      expect(assetRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: "UNDER_MAINTENANCE" }), em);
    });

    it("defaults downtime_note to '' when omitted (NOT NULL column)", async () => {
      await service.schedule(em, { assetId: "asset-1", kind: "PLANNED" }, "user-1");
      expect(maintenanceRepository.create).toHaveBeenCalledWith(expect.objectContaining({ downtimeNote: "" }), em);
    });

    it("reclassifies BR-FA-02's real trg_fa_maintenance_no_txn_after_disposal check_violation (23514) into a clean ValidationException, never a raw 500", async () => {
      assetRepository.findByIdOrFail.mockResolvedValue(makeAsset({ status: "DISPOSED" }));
      maintenanceRepository.create.mockRejectedValueOnce({ code: "23514" });

      await expect(service.schedule(em, { assetId: "asset-1", kind: "REPAIR" }, "user-1")).rejects.toBeInstanceOf(ValidationException);
      expect(assetRepository.save).not.toHaveBeenCalled(); // the asset's status must NOT flip to UNDER_MAINTENANCE when the insert itself was rejected
    });

    it("still rethrows an unrelated DB error unchanged (only 23514 is reclassified)", async () => {
      const dbError = new Error("connection reset");
      maintenanceRepository.create.mockRejectedValueOnce(dbError);
      await expect(service.schedule(em, { assetId: "asset-1", kind: "REPAIR" }, "user-1")).rejects.toBe(dbError);
    });
  });

  describe("complete", () => {
    it("sets done_on and flips fa_asset.status back to ACTIVE", async () => {
      const result = await service.complete(em, "maint-1", { doneOn: "2026-07-15" }, "user-1");
      expect(result.doneOn).toBe("2026-07-15");
      expect(assetRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: "ACTIVE" }), em);
    });

    it("links an already-created exp_voucher id when supplied", async () => {
      await service.complete(em, "maint-1", { doneOn: "2026-07-15", costExpenseVoucherId: "voucher-1" }, "user-1");
      expect(maintenanceRepository.save).toHaveBeenCalledWith(expect.objectContaining({ costExpenseVoucherId: "voucher-1" }), em);
    });

    it("rejects completing an already-complete maintenance event", async () => {
      maintenanceRepository.findByIdOrFail.mockResolvedValue(makeMaintenance({ doneOn: "2026-07-01" }));
      await expect(service.complete(em, "maint-1", { doneOn: "2026-07-15" }, "user-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
