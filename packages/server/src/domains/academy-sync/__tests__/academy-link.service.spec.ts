/* eslint-disable @typescript-eslint/no-explicit-any */
import { decryptFromBuffer } from "../../../shared/crypto/aes-gcm.util";
import { AcademyGatewayException } from "../../../shared/exceptions/academy-gateway.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateAcademySecret } from "../application/academy-signature";
import { AcademyLinkService, normalizeBaseUrl } from "../application/academy-link.service";

const KEY = Buffer.alloc(32, 5).toString("base64");

function makeHarness(over: { connected?: boolean; nodeEnv?: string; existing?: any; putReply?: any; postReply?: any; postError?: Error; putError?: Error } = {}) {
  let stored: any = over.existing ?? null;
  const http = {
    put: jest.fn(async () => {
      if (over.putError) throw over.putError;
      return over.putReply === undefined ? { hmacSecret: generateAcademySecret() } : over.putReply;
    }),
    post: jest.fn(async () => {
      if (over.postError) throw over.postError;
      return over.postReply === undefined ? { ok: true, message: "reached" } : over.postReply;
    }),
  };
  const repository = {
    findCurrent: jest.fn(async () => stored),
    create: jest.fn(async (data: any) => (stored = { id: "link-1", ...data })),
    save: jest.fn(async (row: any) => (stored = row)),
    recordVerification: jest.fn(async (ok: boolean, message: string, at: Date, actorId: string | null) => {
      stored = { ...stored, lastVerifiedAt: at, lastVerifyOk: ok, lastVerifyMessage: message, updatedBy: actorId };
    }),
  };
  const academyLink = { getConnection: jest.fn(async () => (over.connected === false ? null : { apiKey: "kfe_secret_key", academySchoolId: "s1", academySchoolCode: "S" })) };
  const config = { appEncryptionKeyBase64: KEY, nodeEnv: over.nodeEnv ?? "development", webAppUrl: "https://erp.school.example" };
  const service = new AcademyLinkService(academyLink as any, http as any, repository as any, config as any);
  return { service, http, repository, academyLink, get stored() { return stored; } };
}

describe("normalizeBaseUrl", () => {
  it.each([
    ["https://erp.school.example/api/v1", "https://erp.school.example/api/v1"],
    ["  https://erp.school.example/api/v1/  ", "https://erp.school.example/api/v1"],
    ["https://erp.school.example/api/v1///", "https://erp.school.example/api/v1"],
    ["https://erp.school.example", "https://erp.school.example"],
    ["https://erp.school.example:8443/api/v1", "https://erp.school.example:8443/api/v1"],
    ["HTTPS://ERP.School.Example/api/v1", "https://erp.school.example/api/v1"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeBaseUrl(input, false)).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["not a URL", "erp.school.example/api/v1"],
    ["a non-http scheme", "ftp://erp.school.example/api/v1"],
    ["plain http in production", "http://erp.school.example/api/v1"],
    ["credentials in the URL", "https://user:pass@erp.school.example/api/v1"],
    ["a query string", "https://erp.school.example/api/v1?x=1"],
    ["a fragment", "https://erp.school.example/api/v1#top"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["an over-long address", `https://erp.school.example/${"a".repeat(600)}`],
  ])("rejects %s", (_label, input) => {
    expect(() => normalizeBaseUrl(input, false)).toThrow(ValidationException);
  });

  it("allows plain http only when told it is a development setup", () => {
    expect(normalizeBaseUrl("http://localhost:3000/api/v1", true)).toBe("http://localhost:3000/api/v1");
    expect(() => normalizeBaseUrl("http://localhost:3000/api/v1", false)).toThrow(ValidationException);
  });
});

describe("AcademyLinkService.register", () => {
  it("sends the address with the school's key and keeps the returned secret encrypted", async () => {
    const secret = generateAcademySecret();
    const h = makeHarness({ putReply: { hmacSecret: secret } });
    const status = await h.service.register("https://erp.school.example/api/v1/", "admin-1");

    expect(h.http.put).toHaveBeenCalledWith("kfe_secret_key", "/erp/link", { erpBaseUrl: "https://erp.school.example/api/v1" });
    expect(status).toMatchObject({ connected: true, registered: true, registeredBaseUrl: "https://erp.school.example/api/v1", secretVersion: 1, lastVerifyOk: null });
    // encrypted at rest: not the plaintext, and recoverable only with the app key
    const row = h.stored;
    expect(row.secretEnc.toString("utf8")).not.toContain(secret);
    expect(row.secretEnc.toString("base64")).not.toContain(secret);
    expect(decryptFromBuffer(row.secretEnc, KEY)).toBe(secret);
  });

  it("never exposes the secret in the status it returns", async () => {
    const secret = generateAcademySecret();
    const h = makeHarness({ putReply: { hmacSecret: secret } });
    const status = await h.service.register("https://erp.school.example/api/v1", null);
    expect(JSON.stringify(status)).not.toContain(secret);
    expect(Object.keys(status)).not.toContain("secretEnc");
  });

  it("registering again rotates the secret, bumps its version and clears the old test result", async () => {
    const h = makeHarness();
    await h.service.register("https://erp.school.example/api/v1", "a");
    const first = decryptFromBuffer(h.stored.secretEnc, KEY);
    await h.service.testConnection("a");
    expect(h.stored.lastVerifyOk).toBe(true);

    await h.service.register("https://erp.school.example/api/v2", "a");
    expect(h.stored.secretVersion).toBe(2);
    expect(h.stored.registeredBaseUrl).toBe("https://erp.school.example/api/v2");
    expect(decryptFromBuffer(h.stored.secretEnc, KEY)).not.toBe(first);
    expect(h.stored.lastVerifyOk).toBeNull();
    expect(h.stored.lastVerifiedAt).toBeNull();
    expect(h.repository.create).toHaveBeenCalledTimes(1);
  });

  it("refuses an unusable address without calling the Academy", async () => {
    const h = makeHarness();
    await expect(h.service.register("http://erp.school.example", "a")).resolves.toBeDefined(); // development: http allowed
    const prod = makeHarness({ nodeEnv: "production" });
    await expect(prod.service.register("http://erp.school.example", "a")).rejects.toBeInstanceOf(ValidationException);
    expect(prod.http.put).not.toHaveBeenCalled();
  });

  it.each([
    ["no secret", {}],
    ["an empty reply", null],
    ["a secret of the wrong size", { hmacSecret: "tooshort" }],
    ["a secret in the wrong alphabet", { hmacSecret: `${"+".repeat(43)}` }],
  ])("stores nothing when the Academy sends %s", async (_label, reply) => {
    const h = makeHarness({ putReply: reply });
    await expect(h.service.register("https://erp.school.example/api/v1", "a")).rejects.toBeInstanceOf(AcademyGatewayException);
    expect(h.repository.create).not.toHaveBeenCalled();
    expect(h.repository.save).not.toHaveBeenCalled();
  });

  it("keeps the previous registration when the Academy call fails", async () => {
    const h = makeHarness({ putError: new Error("Academy Gateway unreachable") });
    await h.service.register("https://erp.school.example/api/v1", "a").catch(() => undefined);
    expect(h.repository.create).not.toHaveBeenCalled();
  });

  it("needs the ERP to be connected to the Academy first", async () => {
    const h = makeHarness({ connected: false });
    await expect(h.service.register("https://erp.school.example/api/v1", "a")).rejects.toBeInstanceOf(ValidationException);
    expect(h.http.put).not.toHaveBeenCalled();
  });
});

describe("AcademyLinkService.testConnection", () => {
  const existing = () => ({ registeredBaseUrl: "https://erp.school.example/api/v1", secretVersion: 1, registeredAt: new Date(), secretEnc: Buffer.from("x"), lastVerifyOk: null });

  it("records a pass", async () => {
    const h = makeHarness({ existing: existing(), postReply: { ok: true, message: "The Academy reached this ERP." } });
    const status = await h.service.testConnection("admin");
    expect(h.http.post).toHaveBeenCalledWith("kfe_secret_key", "/erp/link/verify", {});
    expect(status).toMatchObject({ lastVerifyOk: true, lastVerifyMessage: "The Academy reached this ERP." });
    expect(status.lastVerifiedAt).toBeInstanceOf(Date);
  });

  it("stores only the test outcome — it must not write back a stale last_inbound_at (the test itself makes the Academy call us)", async () => {
    const h = makeHarness({ existing: existing(), postReply: { ok: true } });
    await h.service.testConnection("admin");
    expect(h.repository.recordVerification).toHaveBeenCalledWith(true, expect.any(String), expect.any(Date), "admin");
    expect(h.repository.save).not.toHaveBeenCalled();
  });

  it("records a failure with the Academy's reason", async () => {
    const h = makeHarness({ existing: existing(), postReply: { ok: false, message: "The ERP answered 401 — the shared secret does not match." } });
    const status = await h.service.testConnection("admin");
    expect(status).toMatchObject({ lastVerifyOk: false, lastVerifyMessage: "The ERP answered 401 — the shared secret does not match." });
  });

  it("records a failure when the Academy itself cannot be asked, instead of throwing", async () => {
    const h = makeHarness({ existing: existing(), postError: new Error("Academy Gateway unreachable (ECONNREFUSED)") });
    const status = await h.service.testConnection("admin");
    expect(status).toMatchObject({ lastVerifyOk: false });
    expect(status.lastVerifyMessage).toContain("ECONNREFUSED");
  });

  it("gives a sensible message when the Academy answers with no message", async () => {
    const pass = await makeHarness({ existing: existing(), postReply: { ok: true } }).service.testConnection("a");
    const fail = await makeHarness({ existing: existing(), postReply: { ok: false } }).service.testConnection("a");
    expect(pass.lastVerifyMessage).toMatch(/reached/i);
    expect(fail.lastVerifyMessage).toMatch(/could not reach/i);
  });

  it("caps an over-long message", async () => {
    const h = makeHarness({ existing: existing(), postReply: { ok: false, message: "x".repeat(2000) } });
    expect((await h.service.testConnection("a")).lastVerifyMessage).toHaveLength(300);
  });

  it("needs a registration first", async () => {
    const h = makeHarness();
    await expect(h.service.testConnection("a")).rejects.toBeInstanceOf(ValidationException);
    expect(h.http.post).not.toHaveBeenCalled();
  });
});

describe("AcademyLinkService.getStatus", () => {
  it("reports not registered, with a suggested address from the web app's host", async () => {
    const status = await makeHarness().service.getStatus();
    expect(status).toMatchObject({ connected: true, registered: false, registeredBaseUrl: null, secretVersion: null, suggestedBaseUrl: "https://erp.school.example/api/v1" });
  });

  it("reports not connected when the ERP has no Academy link", async () => {
    expect((await makeHarness({ connected: false }).service.getStatus()).connected).toBe(false);
  });
});
