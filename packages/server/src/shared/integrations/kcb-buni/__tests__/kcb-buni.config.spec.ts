import { ValidationException } from "../../../exceptions/validation.exception";
import {
  isKcbBuniConfig,
  KCB_BUNI_SANDBOX_GATEWAY_BASE_URL,
  KCB_BUNI_SANDBOX_TOKEN_URL,
  parseKcbBuniConfig,
} from "../kcb-buni.config";

const base = { provider: "KCB_BUNI", consumerKey: "key", consumerSecret: "secret" };

describe("parseKcbBuniConfig", () => {
  it("applies the sandbox hosts when none are given", () => {
    const config = parseKcbBuniConfig(base);
    expect(config.environment).toBe("sandbox");
    expect(config.tokenUrl).toBe(KCB_BUNI_SANDBOX_TOKEN_URL);
    expect(config.gatewayBaseUrl).toBe(KCB_BUNI_SANDBOX_GATEWAY_BASE_URL);
    expect(config.ipnSkipSignatureVerification).toBe(false);
  });

  it("trims values and strips trailing slashes from the gateway origin", () => {
    const config = parseKcbBuniConfig({ ...base, consumerKey: "  key  ", gatewayBaseUrl: "https://gw.example.test///" });
    expect(config.consumerKey).toBe("key");
    expect(config.gatewayBaseUrl).toBe("https://gw.example.test");
  });

  it("requires explicit hosts for production (no silent fall back to the sandbox)", () => {
    expect(() => parseKcbBuniConfig({ ...base, environment: "production" })).toThrow(/tokenUrl.*production/);
    expect(() => parseKcbBuniConfig({ ...base, environment: "production", tokenUrl: "https://t.example.test/token" })).toThrow(/gatewayBaseUrl.*production/);
    const ok = parseKcbBuniConfig({ ...base, environment: "production", tokenUrl: "https://t.example.test/token", gatewayBaseUrl: "https://g.example.test" });
    expect(ok.environment).toBe("production");
  });

  it("names the missing field, never the value", () => {
    expect(() => parseKcbBuniConfig({ provider: "KCB_BUNI", consumerSecret: "topsecret" })).toThrow("'consumerKey' is required");
    try {
      parseKcbBuniConfig({ provider: "KCB_BUNI", consumerKey: "k" });
    } catch (error) {
      expect((error as Error).message).toContain("'consumerSecret' is required");
    }
  });

  it("refuses a non-https endpoint — credentials must not travel in clear text", () => {
    expect(() => parseKcbBuniConfig({ ...base, tokenUrl: "http://accounts.example.test/token" })).toThrow(/tokenUrl.*https/);
    expect(() => parseKcbBuniConfig({ ...base, gatewayBaseUrl: "not a url" })).toThrow(/gatewayBaseUrl.*valid URL/);
  });

  it("only the literal true enables the signature-skip escape hatch", () => {
    expect(parseKcbBuniConfig({ ...base, ipnSkipSignatureVerification: true }).ipnSkipSignatureVerification).toBe(true);
    expect(parseKcbBuniConfig({ ...base, ipnSkipSignatureVerification: "true" }).ipnSkipSignatureVerification).toBe(false);
  });

  it("rejects a config that is not the KCB provider", () => {
    expect(() => parseKcbBuniConfig({ accountId: "x", endpoint: "https://x" })).toThrow(ValidationException);
  });
});

describe("isKcbBuniConfig", () => {
  it("tells the KCB config apart from the generic HTTP statement feed config", () => {
    expect(isKcbBuniConfig({ provider: "KCB_BUNI" })).toBe(true);
    expect(isKcbBuniConfig({ accountId: "a", endpoint: "https://x" })).toBe(false);
  });
});
