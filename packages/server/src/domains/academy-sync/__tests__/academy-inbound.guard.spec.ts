/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutionContext } from "@nestjs/common";
import { encryptToBuffer } from "../../../shared/crypto/aes-gcm.util";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { AcademyInboundGuard } from "../api/academy-inbound.guard";
import { generateAcademySecret, signRequest } from "../application/academy-signature";

const ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
const SCHOOL = "school-123";
const SECRET = generateAcademySecret();
const SECRET_BYTES = Buffer.from(SECRET, "base64url");

function makeHarness(over: { link?: any; connection?: any; redisResult?: string | null; touchFails?: boolean } = {}) {
  const link = over.link === undefined ? { secretEnc: encryptToBuffer(SECRET, ENCRYPTION_KEY) } : over.link;
  const linkRepository = {
    findCurrent: jest.fn(async () => link),
    touchInbound: jest.fn(async () => {
      if (over.touchFails) throw new Error("db down");
    }),
  };
  const academyLink = {
    getConnection: jest.fn(async () => (over.connection === undefined ? { apiKey: "kfe_x", academySchoolId: SCHOOL, academySchoolCode: "S" } : over.connection)),
  };
  const redis = { set: jest.fn(async () => (over.redisResult === undefined ? "OK" : over.redisResult)) };
  const guard = new AcademyInboundGuard(linkRepository as any, academyLink as any, { appEncryptionKeyBase64: ENCRYPTION_KEY } as any, redis as any);
  return { guard, linkRepository, academyLink, redis };
}

/** A request signed the way the Academy signs it, with overridable parts for the negative cases. */
function signedRequest(over: Record<string, any> = {}) {
  const base = {
    method: "GET",
    originalUrl: "/api/v1/academy/inbound/ping",
    rawBody: undefined as Buffer | undefined,
    timestamp: String(Math.floor(Date.now() / 1000)),
    nonce: "n".repeat(24),
    school: SCHOOL,
    secret: SECRET_BYTES,
    ...over,
  };
  const signature =
    over.signature ??
    signRequest(base.secret, { timestamp: base.timestamp, nonce: base.nonce, method: base.method, pathAndQuery: base.originalUrl, body: base.rawBody ?? Buffer.alloc(0) });
  const headers: Record<string, string> = {
    "x-klickit-school": base.school,
    "x-klickit-timestamp": base.timestamp,
    "x-klickit-nonce": base.nonce,
    "x-klickit-signature": signature,
  };
  for (const key of over.dropHeaders ?? []) delete headers[key];
  return { method: base.method, originalUrl: base.originalUrl, rawBody: base.rawBody, headers } as any;
}

const ctx = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

async function rejection(promise: Promise<boolean>): Promise<AuthenticationException> {
  const error = await promise.then(
    () => null,
    (e) => e,
  );
  expect(error).toBeInstanceOf(AuthenticationException);
  return error;
}

describe("AcademyInboundGuard", () => {
  describe("a genuine call", () => {
    it("accepts a signed GET, marks the school, consumes the nonce once and records the call", async () => {
      const h = makeHarness();
      const req = signedRequest();
      await expect(h.guard.canActivate(ctx(req))).resolves.toBe(true);
      expect(req.academyInbound).toEqual({ schoolId: SCHOOL });
      expect(h.redis.set).toHaveBeenCalledWith(`academy:inbound:nonce:${"n".repeat(24)}`, "1", "EX", 600, "NX");
      expect(h.linkRepository.touchInbound).toHaveBeenCalledTimes(1);
    });

    it("accepts a signed POST whose body bytes are signed", async () => {
      const h = makeHarness();
      const body = Buffer.from('{"amount":"1500.00"}');
      await expect(h.guard.canActivate(ctx(signedRequest({ method: "POST", rawBody: body })))).resolves.toBe(true);
    });

    it("includes the query string in what is signed", async () => {
      const h = makeHarness();
      await expect(h.guard.canActivate(ctx(signedRequest({ originalUrl: "/api/v1/academy/inbound/ping?x=1" })))).resolves.toBe(true);
    });

    it("accepts a clock that is almost 5 minutes off, either way", async () => {
      const now = Math.floor(Date.now() / 1000);
      await expect(makeHarness().guard.canActivate(ctx(signedRequest({ timestamp: String(now - 290) })))).resolves.toBe(true);
      await expect(makeHarness().guard.canActivate(ctx(signedRequest({ timestamp: String(now + 290) })))).resolves.toBe(true);
    });

    it("still answers when recording the call fails", async () => {
      const h = makeHarness({ touchFails: true });
      await expect(h.guard.canActivate(ctx(signedRequest()))).resolves.toBe(true);
    });
  });

  describe("every rejection is the same 401 and reveals nothing", () => {
    const messages = new Set<string>();
    afterAll(() => expect([...messages]).toEqual(["Invalid request signature"]));

    const cases: Array<[string, () => { h: ReturnType<typeof makeHarness>; req: any }]> = [
      ["a missing signature header", () => ({ h: makeHarness(), req: signedRequest({ dropHeaders: ["x-klickit-signature"] }) })],
      ["a missing nonce header", () => ({ h: makeHarness(), req: signedRequest({ dropHeaders: ["x-klickit-nonce"] }) })],
      ["a missing timestamp header", () => ({ h: makeHarness(), req: signedRequest({ dropHeaders: ["x-klickit-timestamp"] }) })],
      ["a missing school header", () => ({ h: makeHarness(), req: signedRequest({ dropHeaders: ["x-klickit-school"] }) })],
      ["a too-short nonce", () => ({ h: makeHarness(), req: signedRequest({ nonce: "short" }) })],
      ["a nonce with illegal characters", () => ({ h: makeHarness(), req: signedRequest({ nonce: "has spaces and ! chars......" }) })],
      ["a non-numeric timestamp", () => ({ h: makeHarness(), req: signedRequest({ timestamp: "yesterday" }) })],
      ["a timestamp 6 minutes old", () => ({ h: makeHarness(), req: signedRequest({ timestamp: String(Math.floor(Date.now() / 1000) - 360) }) })],
      ["a timestamp 6 minutes ahead", () => ({ h: makeHarness(), req: signedRequest({ timestamp: String(Math.floor(Date.now() / 1000) + 360) }) })],
      ["no registration with the Academy", () => ({ h: makeHarness({ link: null }), req: signedRequest() })],
      ["no Academy connection", () => ({ h: makeHarness({ connection: null }), req: signedRequest() })],
      ["a different school id", () => ({ h: makeHarness(), req: signedRequest({ school: "someone-elses-school" }) })],
      ["a signature made with another secret", () => ({ h: makeHarness(), req: signedRequest({ secret: Buffer.alloc(32, 1) }) })],
      ["a garbage signature", () => ({ h: makeHarness(), req: signedRequest({ signature: "v1=" + "0".repeat(64) }) })],
      ["a malformed signature header", () => ({ h: makeHarness(), req: signedRequest({ signature: "not-a-signature" }) })],
      ["a POST with no body bytes available", () => ({ h: makeHarness(), req: signedRequest({ method: "POST", rawBody: undefined }) })],
      ["a replayed nonce", () => ({ h: makeHarness({ redisResult: null }), req: signedRequest() })],
    ];

    it.each(cases)("rejects %s", async (_label, build) => {
      const { h, req } = build();
      const error = await rejection(h.guard.canActivate(ctx(req)));
      messages.add(error.message);
      expect(req.academyInbound).toBeUndefined();
      expect(h.linkRepository.touchInbound).not.toHaveBeenCalled();
    });
  });

  describe("tampering", () => {
    it("rejects a body changed after signing (an amount edited in flight)", async () => {
      const h = makeHarness();
      const req = signedRequest({ method: "POST", rawBody: Buffer.from('{"amount":"1500.00"}') });
      req.rawBody = Buffer.from('{"amount":"9500.00"}');
      await rejection(h.guard.canActivate(ctx(req)));
    });

    it("rejects a signature replayed on another path", async () => {
      const h = makeHarness();
      const req = signedRequest();
      req.originalUrl = "/api/v1/academy/inbound/payment-requests";
      await rejection(h.guard.canActivate(ctx(req)));
    });

    it("rejects a signature replayed with another method", async () => {
      const h = makeHarness();
      const req = signedRequest();
      req.method = "POST";
      req.rawBody = Buffer.alloc(0);
      await rejection(h.guard.canActivate(ctx(req)));
    });
  });

  describe("the replay cache", () => {
    it("is only consulted for a request whose signature already verified (nobody can burn nonces they cannot sign for)", async () => {
      const h = makeHarness();
      await rejection(h.guard.canActivate(ctx(signedRequest({ secret: Buffer.alloc(32, 1) }))));
      await rejection(h.guard.canActivate(ctx(signedRequest({ timestamp: "1" }))));
      expect(h.redis.set).not.toHaveBeenCalled();
    });

    it("lets a second use of the same nonce through only if the cache says it is new", async () => {
      const h = makeHarness({ redisResult: null });
      await rejection(h.guard.canActivate(ctx(signedRequest())));
      expect(h.redis.set).toHaveBeenCalledTimes(1);
    });
  });
});
