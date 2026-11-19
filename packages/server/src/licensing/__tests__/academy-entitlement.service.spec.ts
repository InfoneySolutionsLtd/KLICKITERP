import { AcademyEntitlementService } from "../application/academy-entitlement.service";
import { AcademyLinkEntity } from "../domain/academy-link.entity";
import { LicenseEntity, LicenseState } from "../domain/license.entity";
import { AppConfigService } from "../../shared/config/app-config.service";

jest.mock("../../shared/crypto/aes-gcm.util", () => ({
  decryptFromBuffer: jest.fn(() => "decrypted-api-key"),
}));

function makeLink(overrides: Partial<AcademyLinkEntity> = {}): AcademyLinkEntity {
  return {
    id: "link-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    version: 1,
    academySchoolId: "academy-school-1",
    academySchoolCode: "ABC123",
    pendingRefId: null,
    apiKeyId: "key1",
    apiKeyEnc: Buffer.from("placeholder"),
    lastEntitlementCheckedAt: null,
    lastEntitlementSuccessAt: null,
    lastEntitlementAllowed: null,
    lastEntitlementStatus: null,
    lastEntitlementExpiresAt: null,
    lastEntitlementError: null,
    ...overrides,
  } as AcademyLinkEntity;
}

function makeLicense(overrides: Partial<LicenseEntity> = {}): LicenseEntity {
  return {
    id: "lic-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    version: 1,
    schoolId: "school-1",
    plan: "STANDARD",
    features: [],
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    graceDays: 14,
    state: "ACTIVE" as LicenseState,
    licenseBlob: null,
    verifiedAt: null,
    stateChangedAt: null,
    ...overrides,
  } as LicenseEntity;
}

describe("AcademyEntitlementService", () => {
  let gatewayClient: { getEntitlement: jest.Mock };
  let academyLinkRepository: { findCurrent: jest.Mock; save: jest.Mock };
  let licenseRepository: { findCurrent: jest.Mock; create: jest.Mock; save: jest.Mock };
  let config: AppConfigService;
  let service: AcademyEntitlementService;

  beforeEach(() => {
    gatewayClient = { getEntitlement: jest.fn() };
    academyLinkRepository = { findCurrent: jest.fn(), save: jest.fn(async (entity) => entity) };
    licenseRepository = { findCurrent: jest.fn(), create: jest.fn(async (data) => makeLicense(data)), save: jest.fn(async (entity) => entity) };
    config = new AppConfigService();
    service = new AcademyEntitlementService(
      gatewayClient as never,
      academyLinkRepository as never,
      licenseRepository as never,
      config,
    );
  });

  it("no-ops when never onboarded (no academy_link row at all)", async () => {
    academyLinkRepository.findCurrent.mockResolvedValue(null);

    await service.checkEntitlement();

    expect(gatewayClient.getEntitlement).not.toHaveBeenCalled();
    expect(licenseRepository.findCurrent).not.toHaveBeenCalled();
  });

  it("no-ops when onboarded but no API key stored yet", async () => {
    academyLinkRepository.findCurrent.mockResolvedValue(makeLink({ apiKeyEnc: null }));

    await service.checkEntitlement();

    expect(gatewayClient.getEntitlement).not.toHaveBeenCalled();
  });

  it("first successful check with allowed:true creates and activates a license when none exists", async () => {
    academyLinkRepository.findCurrent.mockResolvedValue(makeLink());
    gatewayClient.getEntitlement.mockResolvedValue({
      schoolId: "academy-school-1",
      product: "ERP",
      allowed: true,
      status: "ACTIVE",
      expiresAt: "2027-01-31T23:59:59.000Z",
      subscriptionId: "sub-1",
      checkedAt: "2026-09-23T10:00:00.000Z",
    });
    licenseRepository.findCurrent.mockResolvedValue(null);

    await service.checkEntitlement();

    expect(licenseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: "academy-school-1", state: "ACTIVE", validTo: "2027-01-31" }),
    );
    const savedLink = academyLinkRepository.save.mock.calls[0][0] as AcademyLinkEntity;
    expect(savedLink.lastEntitlementAllowed).toBe(true);
    expect(savedLink.lastEntitlementSuccessAt).not.toBeNull();
  });

  it("allowed:false suspends an existing ACTIVE license", async () => {
    academyLinkRepository.findCurrent.mockResolvedValue(makeLink());
    gatewayClient.getEntitlement.mockResolvedValue({
      schoolId: "academy-school-1",
      product: "ERP",
      allowed: false,
      status: "NONE",
      expiresAt: null,
      subscriptionId: null,
      checkedAt: "2026-09-23T10:00:00.000Z",
    });
    licenseRepository.findCurrent.mockResolvedValue(makeLicense({ state: "ACTIVE" }));

    await service.checkEntitlement();

    expect(licenseRepository.save).toHaveBeenCalledWith(expect.objectContaining({ state: "SUSPENDED" }));
  });

  describe("tells the people who can see the Licence page when the state changes (the bell)", () => {
    function withSink() {
      const sink = { emit: jest.fn(async () => 1) };
      const svc = new AcademyEntitlementService(gatewayClient as never, academyLinkRepository as never, licenseRepository as never, config, sink as never);
      return { sink, svc };
    }
    const answer = (allowed: boolean) => ({
      schoolId: "academy-school-1",
      product: "ERP",
      allowed,
      status: allowed ? "ACTIVE" : "NONE",
      expiresAt: "2027-01-31T00:00:00.000Z",
      subscriptionId: "sub-1",
      checkedAt: "2026-09-23T10:00:00.000Z",
    });

    it("ACTIVE -> SUSPENDED raises LICENCE_STATE_CHANGED with from, to and the valid-until date", async () => {
      academyLinkRepository.findCurrent.mockResolvedValue(makeLink());
      gatewayClient.getEntitlement.mockResolvedValue(answer(false));
      licenseRepository.findCurrent.mockResolvedValue(makeLicense({ state: "ACTIVE", validTo: "2027-01-31" }));
      const { sink, svc } = withSink();

      await svc.checkEntitlement();

      expect(sink.emit).toHaveBeenCalledTimes(1);
      expect(sink.emit).toHaveBeenCalledWith({ code: "LICENCE_STATE_CHANGED", params: { from: "ACTIVE", to: "SUSPENDED", validTo: "2027-01-31" }, link: "/license", entityType: "license" });
    });

    it("a poll that finds the state unchanged says nothing (it polls all the time)", async () => {
      academyLinkRepository.findCurrent.mockResolvedValue(makeLink());
      gatewayClient.getEntitlement.mockResolvedValue(answer(true));
      licenseRepository.findCurrent.mockResolvedValue(makeLicense({ state: "ACTIVE" }));
      const { sink, svc } = withSink();
      await svc.checkEntitlement();
      expect(sink.emit).not.toHaveBeenCalled();
    });

    it("coming back from SUSPENDED to ACTIVE is also announced", async () => {
      academyLinkRepository.findCurrent.mockResolvedValue(makeLink());
      gatewayClient.getEntitlement.mockResolvedValue(answer(true));
      licenseRepository.findCurrent.mockResolvedValue(makeLicense({ state: "SUSPENDED" }));
      const { sink, svc } = withSink();
      await svc.checkEntitlement();
      expect((sink.emit.mock.calls[0] as unknown as [{ params: { from: string; to: string } }])[0].params).toMatchObject({ from: "SUSPENDED", to: "ACTIVE" });
    });
  });

  it("maps a successful status:EXPIRED response to the EXPIRED license state", async () => {
    academyLinkRepository.findCurrent.mockResolvedValue(makeLink());
    gatewayClient.getEntitlement.mockResolvedValue({
      schoolId: "academy-school-1",
      product: "ERP",
      allowed: false,
      status: "EXPIRED",
      expiresAt: "2026-01-31T23:59:59.000Z",
      subscriptionId: "sub-1",
      checkedAt: "2026-09-23T10:00:00.000Z",
    });
    licenseRepository.findCurrent.mockResolvedValue(makeLicense({ state: "ACTIVE" }));

    await service.checkEntitlement();

    expect(licenseRepository.save).toHaveBeenCalledWith(expect.objectContaining({ state: "EXPIRED" }));
  });

  it.each([true, false])("never overrides a DEACTIVATED license, even when allowed=%s", async (allowed) => {
    academyLinkRepository.findCurrent.mockResolvedValue(makeLink());
    gatewayClient.getEntitlement.mockResolvedValue({
      schoolId: "academy-school-1",
      product: "ERP",
      allowed,
      status: allowed ? "ACTIVE" : "EXPIRED",
      expiresAt: null,
      subscriptionId: null,
      checkedAt: "2026-09-23T10:00:00.000Z",
    });
    licenseRepository.findCurrent.mockResolvedValue(makeLicense({ state: "DEACTIVATED" }));

    await service.checkEntitlement();

    expect(licenseRepository.save).not.toHaveBeenCalled();
    expect(licenseRepository.create).not.toHaveBeenCalled();
  });

  it("does not activate billing on failure when no successful check has ever been received", async () => {
    academyLinkRepository.findCurrent.mockResolvedValue(makeLink({ lastEntitlementSuccessAt: null }));
    gatewayClient.getEntitlement.mockRejectedValue(new Error("ECONNREFUSED"));

    await service.checkEntitlement();

    expect(licenseRepository.findCurrent).not.toHaveBeenCalled();
    const savedLink = academyLinkRepository.save.mock.calls[0][0] as AcademyLinkEntity;
    expect(savedLink.lastEntitlementError).toContain("ECONNREFUSED");
  });

  it("is a no-op on outage within the configured grace window", async () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    academyLinkRepository.findCurrent.mockResolvedValue(makeLink({ lastEntitlementSuccessAt: oneHourAgo }));
    gatewayClient.getEntitlement.mockRejectedValue(new Error("ETIMEDOUT"));

    await service.checkEntitlement();

    expect(licenseRepository.findCurrent).not.toHaveBeenCalled();
  });

  it("suspends the license once the outage exceeds the configured grace window", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    academyLinkRepository.findCurrent.mockResolvedValue(makeLink({ lastEntitlementSuccessAt: twentyFiveHoursAgo }));
    gatewayClient.getEntitlement.mockRejectedValue(new Error("ETIMEDOUT"));
    licenseRepository.findCurrent.mockResolvedValue(makeLicense({ state: "ACTIVE" }));

    await service.checkEntitlement();

    expect(licenseRepository.save).toHaveBeenCalledWith(expect.objectContaining({ state: "SUSPENDED" }));
  });
});
