import { AdapterResolverService } from "../infrastructure/adapter-resolver.service";
import { GenericHttpSmsAdapter } from "../infrastructure/adapters/generic-http-sms.adapter";
import { LogOnlyAdapter } from "../infrastructure/adapters/log-only.adapter";
import { SmtpMailAdapter } from "../infrastructure/adapters/smtp-mail.adapter";

describe("AdapterResolverService", () => {
  let integrationConfigService: { list: jest.Mock; getDecryptedConfig: jest.Mock };
  let logOnlyAdapter: LogOnlyAdapter;
  let service: AdapterResolverService;

  beforeEach(() => {
    integrationConfigService = { list: jest.fn(async () => []), getDecryptedConfig: jest.fn() };
    logOnlyAdapter = new LogOnlyAdapter();
    service = new AdapterResolverService(integrationConfigService as never, logOnlyAdapter);
  });

  it("falls back to LogOnlyAdapter for SMS when no SMS integration config is enabled", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "c-1", kind: "SMS", isEnabled: false, priority: 0 }]);

    const adapter = await service.resolveSms();

    expect(adapter).toBe(logOnlyAdapter);
    expect(integrationConfigService.getDecryptedConfig).not.toHaveBeenCalled();
  });

  it("falls back to LogOnlyAdapter for EMAIL when no SMTP config exists at all", async () => {
    integrationConfigService.list.mockResolvedValue([]);
    const adapter = await service.resolveMail();
    expect(adapter).toBe(logOnlyAdapter);
  });

  it("falls back to LogOnlyAdapter for INAPP unconditionally (no outbound transport exists for it at all)", async () => {
    expect(await service.resolve("INAPP")).toBe(logOnlyAdapter);
    expect(integrationConfigService.list).not.toHaveBeenCalled();
  });

  it("falls back to LogOnlyAdapter for WHATSAPP when no WHATSAPP config is enabled, but DOES attempt real resolution", async () => {
    integrationConfigService.list.mockResolvedValue([]);
    expect(await service.resolve("WHATSAPP")).toBe(logOnlyAdapter);
    expect(integrationConfigService.list).toHaveBeenCalled();
  });

  it("resolves the highest-priority enabled WHATSAPP config into a real GenericHttpSmsAdapter (same class SMS uses)", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "wa-1", kind: "WHATSAPP", isEnabled: true, priority: 0 }]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({ endpoint: "https://graph.facebook.com/v20.0/123/messages" });

    const adapter = await service.resolveWhatsapp();

    expect(adapter).toBeInstanceOf(GenericHttpSmsAdapter);
    expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledWith("wa-1");
  });

  it("resolves the highest-priority enabled SMS config into a real GenericHttpSmsAdapter", async () => {
    integrationConfigService.list.mockResolvedValue([
      { id: "low", kind: "SMS", isEnabled: true, priority: 1 },
      { id: "high", kind: "SMS", isEnabled: true, priority: 10 },
      { id: "disabled", kind: "SMS", isEnabled: false, priority: 100 },
    ]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({ endpoint: "https://gw.example.com/send" });

    const adapter = await service.resolveSms();

    expect(adapter).toBeInstanceOf(GenericHttpSmsAdapter);
    expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledWith("high");
  });

  it("caches the resolved adapter instance across calls while the enabled config id is unchanged", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "smtp-1", kind: "SMTP", isEnabled: true, priority: 0 }]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({ host: "smtp.example.com", port: 587, fromAddress: "no-reply@example.com" });

    const first = await service.resolveMail();
    const second = await service.resolveMail();

    expect(first).toBe(second);
    expect(first).toBeInstanceOf(SmtpMailAdapter);
    expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledTimes(1);
  });

  describe("editing a config in place (same id, new credentials)", () => {
    const smtpRow = (configEnc: Buffer) => ({ id: "smtp-1", kind: "SMTP", isEnabled: true, priority: 0, configEnc });

    it("rebuilds the adapter from the new credentials instead of serving the stale one", async () => {
      // Regression: the SMTP port was corrected 993 -> 465 and saved, but "Test
      // connection" kept hitting 993 because the cache was keyed on the id
      // alone. `update()` re-encrypts into the SAME row, so only the blob changes.
      integrationConfigService.list.mockResolvedValue([smtpRow(Buffer.from("ciphertext-v1"))]);
      integrationConfigService.getDecryptedConfig.mockResolvedValueOnce({ host: "mail.example.com", port: 993, fromAddress: "a@example.com" });
      const before = await service.resolveMail();

      integrationConfigService.list.mockResolvedValue([smtpRow(Buffer.from("ciphertext-v2"))]);
      integrationConfigService.getDecryptedConfig.mockResolvedValueOnce({ host: "mail.example.com", port: 465, fromAddress: "a@example.com" });
      const after = await service.resolveMail();

      expect(after).not.toBe(before);
      expect(after).toBeInstanceOf(SmtpMailAdapter);
      expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledTimes(2);
    });

    it("still reuses the cached adapter when the stored credentials are byte-for-byte unchanged", async () => {
      integrationConfigService.list.mockResolvedValue([smtpRow(Buffer.from("same-ciphertext"))]);
      integrationConfigService.getDecryptedConfig.mockResolvedValue({ host: "mail.example.com", port: 465, fromAddress: "a@example.com" });
      const first = await service.resolveMail();

      // A fresh Buffer instance with identical bytes, as a new DB read would return.
      integrationConfigService.list.mockResolvedValue([smtpRow(Buffer.from("same-ciphertext"))]);
      const second = await service.resolveMail();

      expect(second).toBe(first);
      expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledTimes(1);
    });

    it("applies to SMS too (same cache pattern)", async () => {
      const smsRow = (configEnc: Buffer) => ({ id: "sms-1", kind: "SMS", isEnabled: true, priority: 0, configEnc });
      integrationConfigService.getDecryptedConfig.mockResolvedValue({ endpoint: "https://gw.example.com/send" });

      integrationConfigService.list.mockResolvedValue([smsRow(Buffer.from("v1"))]);
      const before = await service.resolveSms();
      integrationConfigService.list.mockResolvedValue([smsRow(Buffer.from("v2"))]);
      const after = await service.resolveSms();

      expect(after).not.toBe(before);
    });
  });
});
