import { KcbBuniApiError } from "../../../shared/integrations/kcb-buni/kcb-buni-api.client";
import { Money } from "../../../shared/money/money";
import { KcbMpesaExpressAdapter } from "../infrastructure/adapters/kcb-mpesa-express.adapter";
import { MpesaAdapterResolverService } from "../infrastructure/mpesa-adapter-resolver.service";
import { MpesaLogOnlyAdapter } from "../infrastructure/adapters/mpesa-log-only.adapter";
import { DarajaAdapter } from "../infrastructure/adapters/daraja.adapter";

const CONFIG = { stkAccountNumber: "1234567", callbackBaseUrl: "https://erp.example.test/api/v1" };

function accepted() {
  return {
    status: 200,
    json: { header: { statusCode: "0", statusDescription: "Success" }, response: { MerchantRequestID: "16813-1590513-1", CheckoutRequestID: "ws_CO_271020211535314658", ResponseCode: 0 } },
    text: "",
  };
}

describe("KcbMpesaExpressAdapter", () => {
  let client: { postJson: jest.Mock };
  let adapter: KcbMpesaExpressAdapter;

  beforeEach(() => {
    client = { postJson: jest.fn(async () => accepted()) };
    adapter = new KcbMpesaExpressAdapter(CONFIG, client);
  });

  it("sends KCB's /stkpush request: whole shillings, '<till>-<ref>', our callback address, a 13-character description", async () => {
    const result = await adapter.stkPush({ amountKes: Money.fromInt(1500), msisdn: "254722000000", accountRef: "ADM1234", transactionDesc: "School fees payment" });

    expect(client.postJson).toHaveBeenCalledWith("/mm/api/request/1.0.0/stkpush", {
      phoneNumber: "254722000000",
      amount: "1500",
      invoiceNumber: "1234567-ADM1234",
      callbackUrl: "https://erp.example.test/api/v1/callbacks/mpesa/stk",
      transactionDescription: "School fees p",
    });
    expect(result).toEqual({ checkoutRequestId: "ws_CO_271020211535314658", merchantRequestId: "16813-1590513-1" });
  });

  it("defaults the description", async () => {
    await adapter.stkPush({ amountKes: Money.fromInt(10), msisdn: "254722000000", accountRef: "A1" });
    expect(client.postJson.mock.calls[0][1].transactionDescription).toBe("School fees");
  });

  it("accepts an amount like 1500.00 (no real cents)", async () => {
    await adapter.stkPush({ amountKes: Money.fromDecimalString("1500.00"), msisdn: "254722000000", accountRef: "A1" });
    expect(client.postJson.mock.calls[0][1].amount).toBe("1500");
  });

  it("REFUSES an amount with cents instead of rounding it — a parent must never be prompted for more than they owe", async () => {
    await expect(adapter.stkPush({ amountKes: Money.fromDecimalString("1000.50"), msisdn: "254722000000", accountRef: "A1" })).rejects.toThrow(/whole shillings only/);
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it("explains a missing till/account number or callback address instead of sending a broken request", async () => {
    await expect(new KcbMpesaExpressAdapter({ callbackBaseUrl: CONFIG.callbackBaseUrl }, client).stkPush({ amountKes: Money.fromInt(1), msisdn: "1", accountRef: "A" })).rejects.toThrow(/stkAccountNumber/);
    await expect(new KcbMpesaExpressAdapter({ stkAccountNumber: "1" }, client).stkPush({ amountKes: Money.fromInt(1), msisdn: "1", accountRef: "A" })).rejects.toThrow(/callbackBaseUrl/);
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it("turns KCB's refusal into an error carrying KCB's own reason", async () => {
    client.postJson.mockResolvedValueOnce({ status: 200, json: { header: { statusCode: "1", statusDescription: "Invalid phone number" } }, text: "" });
    const failure = await adapter.stkPush({ amountKes: Money.fromInt(10), msisdn: "bad", accountRef: "A" }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(KcbBuniApiError);
    expect((failure as Error).message).toContain("Invalid phone number");
    expect((failure as KcbBuniApiError).statusCode).toBe("1");
  });

  it("treats a gateway error (no token / not subscribed) as a failure, with the gateway's reason", async () => {
    client.postJson.mockResolvedValueOnce({ status: 401, json: { code: "900902", message: "Missing Credentials", description: "Invalid Credentials." }, text: "" });
    await expect(adapter.stkPush({ amountKes: Money.fromInt(10), msisdn: "254722000000", accountRef: "A" })).rejects.toThrow(/Invalid Credentials/);
  });

  it("a 'success' answer without a CheckoutRequestID is not a success — nothing to correlate the callback with", async () => {
    client.postJson.mockResolvedValueOnce({ status: 200, json: { header: { statusCode: "0" }, response: {} }, text: "" });
    await expect(adapter.stkPush({ amountKes: Money.fromInt(10), msisdn: "254722000000", accountRef: "A" })).rejects.toBeInstanceOf(KcbBuniApiError);
  });

  it("says plainly that KCB has no status query and no payouts", async () => {
    expect(adapter.supportsStatusQuery).toBe(false);
    await expect(adapter.queryStkStatus("x")).rejects.toThrow(/no status-query/);
    await expect(adapter.b2cPayment({ amountKes: Money.fromInt(1), msisdn: "1", remarks: "r" })).rejects.toThrow(/Funds Transfer/);
  });
});

describe("MpesaAdapterResolverService — which provider collects the STK push", () => {
  const logOnly = new MpesaLogOnlyAdapter();
  let integrationConfigs: { list: jest.Mock; getDecryptedConfig: jest.Mock };
  let kcbResolver: { resolve: jest.Mock };
  let resolver: MpesaAdapterResolverService;
  const kcb = (config: Record<string, unknown>) => ({ configId: "kcb-1", config: { gatewayBaseUrl: "https://gw.example.test", ...config }, tokenProvider: { getAccessToken: jest.fn(), invalidate: jest.fn() }, ipnPublicKey: null });

  beforeEach(() => {
    integrationConfigs = { list: jest.fn(async () => []), getDecryptedConfig: jest.fn() };
    kcbResolver = { resolve: jest.fn(async () => null) };
    resolver = new MpesaAdapterResolverService(integrationConfigs as never, logOnly, kcbResolver as never);
  });

  it("falls back to the log-only adapter when nothing is configured", async () => {
    expect(await resolver.resolve()).toBe(logOnly);
  });

  it("uses Safaricom Daraja when an MPESA config is enabled — even if KCB is configured too", async () => {
    integrationConfigs.list.mockResolvedValue([{ id: "m-1", kind: "MPESA", isEnabled: true, priority: 0 }]);
    integrationConfigs.getDecryptedConfig.mockResolvedValue({ environment: "sandbox", consumerKey: "k", consumerSecret: "s", shortcode: "174379", passkey: "p", callbackBaseUrl: "https://x" });
    kcbResolver.resolve.mockResolvedValue(kcb({ stkAccountNumber: "1", callbackBaseUrl: "https://c" }));
    expect(await resolver.resolve()).toBeInstanceOf(DarajaAdapter);
  });

  it("uses KCB M-Pesa Express when there is no Daraja config and KCB has its till/account and callback address", async () => {
    kcbResolver.resolve.mockResolvedValue(kcb({ stkAccountNumber: "1234567", callbackBaseUrl: "https://erp.example.test/api/v1" }));
    const adapter = await resolver.resolve();
    expect(adapter).toBeInstanceOf(KcbMpesaExpressAdapter);
    expect(await resolver.resolve()).toBe(adapter); // same instance while the saved config is unchanged
  });

  it("ignores a KCB config that is not set up for M-Pesa Express (no till/account or no callback address)", async () => {
    kcbResolver.resolve.mockResolvedValue(kcb({ stkAccountNumber: "1234567" }));
    expect(await resolver.resolve()).toBe(logOnly);
    kcbResolver.resolve.mockResolvedValue(kcb({ callbackBaseUrl: "https://c" }));
    expect(await resolver.resolve()).toBe(logOnly);
  });
});
