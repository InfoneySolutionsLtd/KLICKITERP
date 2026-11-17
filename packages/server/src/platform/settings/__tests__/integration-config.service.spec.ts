import { Logger } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { IntegrationConfigService } from "../application/integration-config.service";
import { SetIntegrationConfigEntity, SetIntegrationKind } from "../domain/set-integration-config.entity";
import { fetchDarajaOAuthToken } from "../infrastructure/mpesa-oauth-probe";

// A real network call has no place in a unit test (no outbound network in
// this dev environment either, docs/phase-5/PROGRESS.md "Environment
// status") — the OAuth probe function itself is mocked here; its own real
// HTTPS request-building logic is exercised live in Slice 7's verification
// pass against the actually-running apps/api, not here.
jest.mock("../infrastructure/mpesa-oauth-probe", () => ({ fetchDarajaOAuthToken: jest.fn() }));
const mockFetchDarajaOAuthToken = fetchDarajaOAuthToken as jest.MockedFunction<typeof fetchDarajaOAuthToken>;

// Same for KCB BUNI: the token request is the only network call, so the token provider is replaced.
const mockKcbGetAccessToken = jest.fn();
jest.mock("../../../shared/integrations/kcb-buni/kcb-buni-token.provider", () => ({
  KcbBuniTokenProvider: jest.fn().mockImplementation(() => ({ getAccessToken: (...args: unknown[]) => mockKcbGetAccessToken(...args) })),
}));

describe("IntegrationConfigService", () => {
  let repository: {
    findByKindAndName: jest.Mock;
    findById: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: IntegrationConfigService;

  beforeEach(() => {
    repository = {
      findByKindAndName: jest.fn(async () => null),
      findById: jest.fn(),
      list: jest.fn(),
      create: jest.fn(
        async (data: Partial<SetIntegrationConfigEntity>) => ({ id: "cfg-1", ...data }) as SetIntegrationConfigEntity,
      ),
      save: jest.fn(async (entity: SetIntegrationConfigEntity) => entity),
    };
    service = new IntegrationConfigService(repository as never, new AppConfigService());
    mockFetchDarajaOAuthToken.mockReset();
  });

  describe("credential encryption (FR-SET-003.1)", () => {
    it("encrypts config on create — config_enc never contains the plaintext credential", async () => {
      const created = await service.create(
        { kind: "SMTP", name: "primary", config: { host: "smtp.example.com", pass: "s3cr3t-value" } },
        "actor-1",
      );

      expect(Buffer.isBuffer(created.configEnc)).toBe(true);
      expect(created.configEnc.toString("utf8")).not.toContain("s3cr3t-value");
    });

    it("round-trips through getDecryptedConfig", async () => {
      const created = await service.create({ kind: "MPESA", name: "daraja", config: { key: "abc", secret: "def" } }, null);
      repository.findById.mockResolvedValue(created);

      expect(await service.getDecryptedConfig(created.id)).toEqual({ key: "abc", secret: "def" });
    });

    it("re-encrypts on update when config changes", async () => {
      const created = await service.create({ kind: "SMTP", name: "primary", config: { pass: "old" } }, null);
      repository.findById.mockResolvedValue(created);

      const updated = await service.update(created.id, { config: { pass: "new" } }, "actor-2");
      repository.findById.mockResolvedValue(updated);

      expect(await service.getDecryptedConfig(created.id)).toEqual({ pass: "new" });
    });

    it("rejects a duplicate kind+name", async () => {
      repository.findByKindAndName.mockResolvedValue({ id: "existing" });
      await expect(service.create({ kind: "SMTP", name: "primary", config: {} }, null)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe("revealConfigForEdit (pre-fills the Edit dialog)", () => {
    it("returns the full saved credential payload, secrets included", async () => {
      const created = await service.create(
        { kind: "SMTP", name: "primary", config: { host: "mail.example.com", port: 465, secure: true, user: "erp@example.com", pass: "s3cr3t-value" } },
        null,
      );
      repository.findById.mockResolvedValue(created);

      await expect(service.revealConfigForEdit(created.id, "actor-1")).resolves.toEqual({
        host: "mail.example.com",
        port: 465,
        secure: true,
        user: "erp@example.com",
        pass: "s3cr3t-value",
      });
    });

    it("reveals the CURRENT credentials after an in-place update, not the originals", async () => {
      const created = await service.create({ kind: "SMTP", name: "primary", config: { port: 993 } }, null);
      repository.findById.mockResolvedValue(created);
      const updated = await service.update(created.id, { config: { port: 465 } }, "actor-2");
      repository.findById.mockResolvedValue(updated);

      await expect(service.revealConfigForEdit(created.id, "actor-2")).resolves.toEqual({ port: 465 });
    });

    it("never writes the credential values to the log — only who/which config", async () => {
      const created = await service.create({ kind: "SMTP", name: "primary", config: { pass: "s3cr3t-value" } }, null);
      repository.findById.mockResolvedValue(created);
      const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

      await service.revealConfigForEdit(created.id, "actor-7");

      const logged = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
      expect(logged).toContain("actor-7");
      expect(logged).toContain(created.id);
      expect(logged).not.toContain("s3cr3t-value");
      logSpy.mockRestore();
    });

    it("answers 422 (not 500) when the stored blob can no longer be decrypted", async () => {
      const created = await service.create({ kind: "SMTP", name: "primary", config: { pass: "x" } }, null);
      created.configEnc[created.configEnc.length - 1] ^= 0xff; // corrupt the GCM auth tag, as a rotated key would
      repository.findById.mockResolvedValue(created);
      const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

      await expect(service.revealConfigForEdit(created.id, "actor-1")).rejects.toBeInstanceOf(ValidationException);
      warnSpy.mockRestore();
    });

    it("404s for an unknown config", async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.revealConfigForEdit("missing", "actor-1")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("testConnection stub (no real adapters exist yet, except MPESA — see below)", () => {
    // MPESA deliberately excluded (Phase 6 Slice 7) — it now routes to a
    // real testMpesaConnection() branch instead of this generic stub; see
    // the dedicated "testConnection MPESA (real Daraja OAuth probe)" block.
    const KINDS: SetIntegrationKind[] = [
      "SMTP",
      "SMS",
      "FCM",
      "QUICKBOOKS",
      "XERO",
      "SAGE",
      "BANK",
      "WHATSAPP",
    ];

    it.each(KINDS)("returns { ok: false, message: adapter-not-yet-available } for kind=%s", async (kind) => {
      const row = {
        id: "cfg-1",
        kind,
        configEnc: Buffer.alloc(0),
        lastTestedAt: null,
        lastTestOk: null,
      } as unknown as SetIntegrationConfigEntity;
      repository.findById.mockResolvedValue(row);

      const result = await service.testConnection("cfg-1", "actor-1");

      expect(result).toEqual({ ok: false, message: "adapter not yet available, config saved" });
    });

    it("updates last_tested_at/last_test_ok as a side effect", async () => {
      const row = {
        id: "cfg-1",
        kind: "SMTP",
        configEnc: Buffer.alloc(0),
        lastTestedAt: null,
        lastTestOk: null,
      } as unknown as SetIntegrationConfigEntity;
      repository.findById.mockResolvedValue(row);

      await service.testConnection("cfg-1", "actor-9");

      expect(row.lastTestOk).toBe(false);
      expect(row.lastTestedAt).toBeInstanceOf(Date);
      expect(row.updatedBy).toBe("actor-9");
      expect(repository.save).toHaveBeenCalledWith(row);
    });
  });

  describe("testConnection MPESA (real Daraja OAuth probe, Phase 6 Slice 7)", () => {
    async function createMpesaRow(config: Record<string, unknown>): Promise<SetIntegrationConfigEntity> {
      const created = await service.create({ kind: "MPESA", name: "daraja", config }, null);
      repository.findById.mockResolvedValue(created);
      return created;
    }

    it("reports a real success when the OAuth probe succeeds, passing through the decrypted credentials", async () => {
      const row = await createMpesaRow({
        environment: "sandbox",
        consumerKey: "test-consumer-key",
        consumerSecret: "test-consumer-secret",
        shortcode: "174379",
        passkey: "test-passkey",
        callbackBaseUrl: "http://localhost:3000",
      });
      mockFetchDarajaOAuthToken.mockResolvedValueOnce("fake-access-token");

      const result = await service.testConnection(row.id, "actor-1");

      expect(result.ok).toBe(true);
      expect(result.message).toContain("succeeded");
      expect(mockFetchDarajaOAuthToken).toHaveBeenCalledWith({
        environment: "sandbox",
        consumerKey: "test-consumer-key",
        consumerSecret: "test-consumer-secret",
      });
    });

    it("reports a real, honest failure (never the old stub message) when the OAuth probe rejects", async () => {
      const row = await createMpesaRow({
        environment: "sandbox",
        consumerKey: "test-consumer-key",
        consumerSecret: "test-consumer-secret",
        shortcode: "174379",
        passkey: "test-passkey",
        callbackBaseUrl: "http://localhost:3000",
      });
      mockFetchDarajaOAuthToken.mockRejectedValueOnce(new Error("Daraja OAuth token endpoint responded 401: invalid credentials"));

      const result = await service.testConnection(row.id, "actor-1");

      expect(result.ok).toBe(false);
      expect(result.message).toContain("Daraja OAuth token fetch failed");
      expect(result.message).toContain("invalid credentials");
      expect(result.message).not.toBe("adapter not yet available, config saved");
    });

    it("passes the config's own timeoutMs through to the OAuth probe when present", async () => {
      const row = await createMpesaRow({
        environment: "production",
        consumerKey: "test-consumer-key",
        consumerSecret: "test-consumer-secret",
        shortcode: "174379",
        passkey: "test-passkey",
        callbackBaseUrl: "http://localhost:3000",
        timeoutMs: 3000,
      });
      mockFetchDarajaOAuthToken.mockResolvedValueOnce("fake-access-token");

      await service.testConnection(row.id, "actor-1");

      expect(mockFetchDarajaOAuthToken).toHaveBeenCalledWith({
        environment: "production",
        consumerKey: "test-consumer-key",
        consumerSecret: "test-consumer-secret",
        timeoutMs: 3000,
      });
    });

    it("returns ok:false WITHOUT attempting a network call when consumerKey/consumerSecret are missing", async () => {
      const row = await createMpesaRow({ environment: "sandbox", shortcode: "174379" });

      const result = await service.testConnection(row.id, "actor-1");

      expect(result.ok).toBe(false);
      expect(result.message).toContain("consumerKey/consumerSecret");
      expect(mockFetchDarajaOAuthToken).not.toHaveBeenCalled();
    });

    it("still updates last_tested_at/last_test_ok for MPESA, same as every other kind", async () => {
      const row = await createMpesaRow({ environment: "sandbox", consumerKey: "k", consumerSecret: "s" });
      mockFetchDarajaOAuthToken.mockResolvedValueOnce("fake-access-token");

      await service.testConnection(row.id, "actor-9");

      expect(row.lastTestOk).toBe(true);
      expect(row.lastTestedAt).toBeInstanceOf(Date);
      expect(row.updatedBy).toBe("actor-9");
    });
  });
});

// ---- KCB BUNI flavour of BANK: a REAL sign-in check (no network in a unit test — the token provider is mocked) ----
describe("IntegrationConfigService.testConnection — BANK / KCB_BUNI", () => {
  let repository: { findById: jest.Mock; save: jest.Mock; create: jest.Mock; findByKindAndName: jest.Mock; list: jest.Mock };
  let service: IntegrationConfigService;
  const getAccessToken = mockKcbGetAccessToken;

  beforeEach(() => {
    getAccessToken.mockReset();
    repository = {
      findById: jest.fn(),
      save: jest.fn(async (entity: SetIntegrationConfigEntity) => entity),
      create: jest.fn(async (data: Partial<SetIntegrationConfigEntity>) => ({ id: "cfg-1", ...data }) as SetIntegrationConfigEntity),
      findByKindAndName: jest.fn(async () => null),
      list: jest.fn(),
    };
    service = new IntegrationConfigService(repository as never, new AppConfigService());
  });

  async function bankRow(config: Record<string, unknown>): Promise<SetIntegrationConfigEntity> {
    const created = await service.create({ kind: "BANK", name: "kcb", config }, null);
    repository.findById.mockResolvedValue(created);
    return created;
  }

  it("reports success when KCB issues a token, and lists what is still missing for notifications", async () => {
    const row = await bankRow({ provider: "KCB_BUNI", environment: "sandbox", consumerKey: "k", consumerSecret: "s" });
    getAccessToken.mockResolvedValueOnce("the-token");

    const result = await service.testConnection(row.id, "actor-1");

    expect(result.ok).toBe(true);
    expect(result.message).toContain("KCB BUNI sign-in succeeded (sandbox)");
    expect(result.message).toContain("public key is not set yet");
    expect(result.message).toContain("No bank account is selected");
    expect(result.message).not.toContain("the-token");
    expect(row.lastTestOk).toBe(true);
  });

  it("has nothing left to say when the key, the skip flag or the bank account are all set", async () => {
    const row = await bankRow({ provider: "KCB_BUNI", consumerKey: "k", consumerSecret: "s", ipnSkipSignatureVerification: true, bankAccountId: "acct-1" });
    getAccessToken.mockResolvedValueOnce("t");
    const result = await service.testConnection(row.id, "actor-1");
    expect(result).toEqual({ ok: true, message: "KCB BUNI sign-in succeeded (sandbox)." });
  });

  it("reports KCB's refusal as a clean failure", async () => {
    const row = await bankRow({ provider: "KCB_BUNI", consumerKey: "k", consumerSecret: "wrong" });
    getAccessToken.mockRejectedValueOnce(new Error("KCB BUNI token request was refused (HTTP 401, invalid_client)"));

    const result = await service.testConnection(row.id, "actor-1");

    expect(result).toEqual({ ok: false, message: "KCB BUNI sign-in failed: KCB BUNI token request was refused (HTTP 401, invalid_client)" });
    expect(row.lastTestOk).toBe(false);
  });

  it("explains an incomplete config instead of calling KCB", async () => {
    const row = await bankRow({ provider: "KCB_BUNI", consumerKey: "k" });
    const result = await service.testConnection(row.id, "actor-1");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("'consumerSecret' is required");
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("leaves the generic HTTP statement feed on its old stub answer", async () => {
    const row = await bankRow({ accountId: "a", endpoint: "https://x", dateField: "d", descriptionField: "n", amountField: "a" });
    expect(await service.testConnection(row.id, "actor-1")).toEqual({ ok: false, message: "adapter not yet available, config saved" });
  });
});
