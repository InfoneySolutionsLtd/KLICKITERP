import { AcademyOnboardingService } from "../application/academy-onboarding.service";
import { AcademyLinkEntity } from "../domain/academy-link.entity";
import { AppConfigService } from "../../shared/config/app-config.service";

jest.mock("../../shared/crypto/aes-gcm.util", () => ({
  encryptToBuffer: jest.fn(() => Buffer.from("encrypted")),
}));

function makeLink(overrides: Partial<AcademyLinkEntity> = {}): AcademyLinkEntity {
  return {
    id: "link-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    version: 1,
    academySchoolId: null,
    academySchoolCode: null,
    pendingRefId: null,
    apiKeyId: null,
    apiKeyEnc: null,
    lastEntitlementCheckedAt: null,
    lastEntitlementSuccessAt: null,
    lastEntitlementAllowed: null,
    lastEntitlementStatus: null,
    lastEntitlementExpiresAt: null,
    lastEntitlementError: null,
    ...overrides,
  } as AcademyLinkEntity;
}

describe("AcademyOnboardingService", () => {
  let gatewayClient: { startOnboarding: jest.Mock; verifyOnboarding: jest.Mock };
  let academyLinkRepository: { findCurrentOrCreate: jest.Mock; save: jest.Mock };
  let config: AppConfigService;
  let entitlementService: { checkEntitlement: jest.Mock };
  let service: AcademyOnboardingService;

  beforeEach(() => {
    gatewayClient = { startOnboarding: jest.fn(), verifyOnboarding: jest.fn() };
    academyLinkRepository = {
      findCurrentOrCreate: jest.fn(async () => makeLink()),
      save: jest.fn(async (entity: AcademyLinkEntity) => entity),
    };
    config = new AppConfigService();
    entitlementService = { checkEntitlement: jest.fn().mockResolvedValue(undefined) };
    service = new AcademyOnboardingService(
      gatewayClient as never,
      academyLinkRepository as never,
      config,
      entitlementService as never,
    );
  });

  it("start persists pendingRefId and returns the gateway response verbatim", async () => {
    gatewayClient.startOnboarding.mockResolvedValue({
      schoolId: "s1",
      schoolName: "Example Academy",
      schoolCode: "ABC123",
      refId: "r1",
      expiresInMinutes: 10,
      message: "Code sent successfully to your email and phone number",
      email: "a***@example.com",
      phoneNumber: "+254****42",
      emailSent: true,
      smsSent: true,
    });

    const result = await service.start("abc123");

    expect(result.refId).toBe("r1");
    expect(gatewayClient.startOnboarding).toHaveBeenCalledWith("abc123");
    const saved = academyLinkRepository.save.mock.calls[0][0] as AcademyLinkEntity;
    expect(saved.pendingRefId).toBe("r1");
  });

  it("verify stores the encrypted apiKey, extracts the key id, clears pendingRefId, and never returns the raw key", async () => {
    gatewayClient.verifyOnboarding.mockResolvedValue({
      school: {
        id: "academy-school-1",
        schoolName: "Example Academy",
        schoolCode: "ABC123",
        schoolType: "SCHOOL",
        schoolStatus: "ACTIVE",
        countryId: "ke",
        region: "Nairobi",
        contactEmail: "admin@example.com",
        contactPhone: "+254700000000",
        configComplete: true,
      },
      administrator: { id: "u1", email: "admin@example.com", firstName: "Jane", lastName: "Doe" },
      apiKey: "kfe_key1_secret",
      apiKeyWarning: "Store this key securely. It will not be shown again.",
    });

    const result = await service.verify("academy-school-1", "r1", "4821");

    expect(result.school.id).toBe("academy-school-1");
    expect(result.administrator.id).toBe("u1");
    expect(JSON.stringify(result)).not.toContain("kfe_key1_secret");

    const saved = academyLinkRepository.save.mock.calls[0][0] as AcademyLinkEntity;
    expect(saved.academySchoolId).toBe("academy-school-1");
    expect(saved.academySchoolCode).toBe("ABC123");
    expect(saved.apiKeyId).toBe("kfe_key1");
    expect(saved.pendingRefId).toBeNull();
    expect(saved.apiKeyEnc).toEqual(Buffer.from("encrypted"));
  });

  it("triggers a best-effort entitlement check after verify, and never throws if that check fails", async () => {
    gatewayClient.verifyOnboarding.mockResolvedValue({
      school: {
        id: "s1",
        schoolName: "Example",
        schoolCode: "ABC123",
        schoolType: "SCHOOL",
        schoolStatus: "ACTIVE",
        countryId: "ke",
        region: "Nairobi",
        contactEmail: "a@example.com",
        contactPhone: "+254700000000",
        configComplete: true,
      },
      administrator: { id: "u1", email: "a@example.com", firstName: "Jane", lastName: "Doe" },
      apiKey: "kfe_key1_secret",
      apiKeyWarning: "warn",
    });
    entitlementService.checkEntitlement.mockRejectedValue(new Error("boom"));

    await expect(service.verify("s1", "r1", "4821")).resolves.toBeDefined();
    expect(entitlementService.checkEntitlement).toHaveBeenCalled();
    // let the fire-and-forget .catch() handler settle before the test ends
    await new Promise((resolve) => setImmediate(resolve));
  });
});
