import { AcademyLinkPortAdapter } from "../application/academy-link-port.adapter";

jest.mock("../../shared/crypto/aes-gcm.util", () => ({
  decryptFromBuffer: jest.fn(() => "kfe_keyid_secret"),
}));

describe("AcademyLinkPortAdapter", () => {
  const config = { appEncryptionKeyBase64: "key" } as never;

  it("returns null until the ERP has been onboarded with the Academy", async () => {
    const adapter = new AcademyLinkPortAdapter({ findCurrent: jest.fn().mockResolvedValue(null) } as never, config);
    await expect(adapter.getConnection()).resolves.toBeNull();
  });

  it("returns null for a link row that has no key yet (onboarding started, not verified)", async () => {
    const adapter = new AcademyLinkPortAdapter({ findCurrent: jest.fn().mockResolvedValue({ apiKeyEnc: null, pendingRefId: "ref" }) } as never, config);
    await expect(adapter.getConnection()).resolves.toBeNull();
  });

  it("hands out the decrypted key with the school identity, and nothing else", async () => {
    const adapter = new AcademyLinkPortAdapter(
      {
        findCurrent: jest.fn().mockResolvedValue({
          apiKeyEnc: Buffer.from("ciphertext"),
          apiKeyId: "kfe_keyid",
          academySchoolId: "school-1",
          academySchoolCode: "ABC123",
          lastEntitlementError: "something internal",
        }),
      } as never,
      config,
    );
    await expect(adapter.getConnection()).resolves.toEqual({
      apiKey: "kfe_keyid_secret",
      academySchoolId: "school-1",
      academySchoolCode: "ABC123",
    });
  });
});
