import { BankFeedAdapterResolverService } from "../infrastructure/bank-feed-adapter-resolver.service";
import { GenericHttpBankFeedAdapter } from "../infrastructure/adapters/generic-http-bank-feed.adapter";

describe("BankFeedAdapterResolverService", () => {
  let integrationConfigService: { list: jest.Mock; getDecryptedConfig: jest.Mock };
  let service: BankFeedAdapterResolverService;

  beforeEach(() => {
    integrationConfigService = { list: jest.fn(async () => []), getDecryptedConfig: jest.fn() };
    service = new BankFeedAdapterResolverService(integrationConfigService as never);
  });

  it("returns null when no enabled BANK config exists", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "c-1", kind: "BANK", isEnabled: false, priority: 0 }]);
    expect(await service.resolveForAccount("acc-1")).toBeNull();
    expect(integrationConfigService.getDecryptedConfig).not.toHaveBeenCalled();
  });

  it("returns null when enabled BANK configs exist but none match this account", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "c-1", kind: "BANK", isEnabled: true, priority: 0 }]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({ accountId: "acc-other", endpoint: "https://x" });
    expect(await service.resolveForAccount("acc-1")).toBeNull();
  });

  it("resolves the highest-priority enabled BANK config whose decrypted accountId matches", async () => {
    integrationConfigService.list.mockResolvedValue([
      { id: "low", kind: "BANK", isEnabled: true, priority: 1 },
      { id: "high", kind: "BANK", isEnabled: true, priority: 10 },
    ]);
    integrationConfigService.getDecryptedConfig.mockImplementation(async (id: string) =>
      id === "high"
        ? { accountId: "acc-1", endpoint: "https://gw.example.com/tx", dateField: "d", descriptionField: "desc", amountField: "amt" }
        : { accountId: "acc-other", endpoint: "https://other" },
    );

    const resolved = await service.resolveForAccount("acc-1");

    expect(resolved?.configId).toBe("high");
    expect(resolved?.adapter).toBeInstanceOf(GenericHttpBankFeedAdapter);
  });

  it("caches the resolved adapter instance across calls while the matching config id is unchanged", async () => {
    integrationConfigService.list.mockResolvedValue([{ id: "c-1", kind: "BANK", isEnabled: true, priority: 0 }]);
    integrationConfigService.getDecryptedConfig.mockResolvedValue({
      accountId: "acc-1",
      endpoint: "https://gw.example.com/tx",
      dateField: "d",
      descriptionField: "desc",
      amountField: "amt",
    });

    const first = await service.resolveForAccount("acc-1");
    const second = await service.resolveForAccount("acc-1");

    expect(first?.adapter).toBe(second?.adapter);
    expect(integrationConfigService.getDecryptedConfig).toHaveBeenCalledTimes(1);
  });
});
