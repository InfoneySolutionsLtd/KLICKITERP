import {
  buildStringToSign,
  decodeAcademySecret,
  generateAcademySecret,
  signRequest,
  verifySignature,
  SignableRequest,
} from "../application/academy-signature";

/**
 * GOLDEN VECTORS — computed independently of the implementation, and the SAME values are asserted in the Academy's
 * klickit-academy-billing-service (`erp-link/erp-signature.spec.ts`). If either side changes the algorithm, one of the two
 * suites fails, so the two repos cannot drift apart silently. Do not "fix" these by regenerating them.
 */
const SECRET_B64URL = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"; // bytes 0x00..0x1f
const secret = Buffer.from(SECRET_B64URL, "base64url");

const PING: SignableRequest = {
  timestamp: "1700000000",
  nonce: "abcdefghijklmnop",
  method: "GET",
  pathAndQuery: "/api/v1/academy/inbound/ping",
  body: Buffer.alloc(0),
};
const PING_SIGNATURE = "v1=ee7821ad3d318f3a950b2d482b6dcdcee99614fb2241ad0dab69ccbb69ca6346";

const POST: SignableRequest = {
  timestamp: "1700000123",
  nonce: "Nonce_0123456789-ABCDEF",
  method: "post", // lower case on purpose: the method is upper-cased before signing
  pathAndQuery: "/api/v1/academy/inbound/payment-requests?x=1",
  body: Buffer.from('{"amount":"1500.00","phone":"0712345678"}'),
};
const POST_SIGNATURE = "v1=d037dfe15647adc708291080978e6584984f637059ea406640d9bc9a415e7a85";

describe("Academy request signature (v1)", () => {
  it("matches the golden vector for a GET with no body", () => {
    expect(signRequest(secret, PING)).toBe(PING_SIGNATURE);
  });

  it("matches the golden vector for a POST with a body (method upper-cased, query included)", () => {
    expect(signRequest(secret, POST)).toBe(POST_SIGNATURE);
  });

  it("builds the string to sign exactly as the spec says", () => {
    expect(buildStringToSign(PING)).toBe(
      "v1\n1700000000\nabcdefghijklmnop\nGET\n/api/v1/academy/inbound/ping\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("accepts a string body the same as the equivalent bytes", () => {
    expect(signRequest(secret, { ...POST, body: '{"amount":"1500.00","phone":"0712345678"}' })).toBe(POST_SIGNATURE);
  });

  describe("verifySignature", () => {
    it("accepts the genuine signature", () => {
      expect(verifySignature(secret, PING, PING_SIGNATURE)).toBe(true);
      expect(verifySignature(secret, POST, POST_SIGNATURE)).toBe(true);
    });

    it("rejects a signature made with another secret", () => {
      const other = Buffer.alloc(32, 7);
      expect(verifySignature(secret, PING, signRequest(other, PING))).toBe(false);
    });

    it.each([
      ["a different timestamp", { timestamp: "1700000001" }],
      ["a different nonce", { nonce: "abcdefghijklmnoq" }],
      ["a different method", { method: "POST" }],
      ["a different path", { pathAndQuery: "/api/v1/academy/inbound/other" }],
      ["a different query", { pathAndQuery: "/api/v1/academy/inbound/ping?a=1" }],
      ["a different body", { body: Buffer.from("x") }],
    ])("rejects the same signature on %s", (_label, change) => {
      expect(verifySignature(secret, { ...PING, ...change }, PING_SIGNATURE)).toBe(false);
    });

    it("rejects a tampered body of a signed POST (an amount changed in flight)", () => {
      expect(verifySignature(secret, { ...POST, body: Buffer.from('{"amount":"9500.00","phone":"0712345678"}') }, POST_SIGNATURE)).toBe(false);
    });

    it.each([
      ["missing", undefined],
      ["empty", ""],
      ["no version prefix", PING_SIGNATURE.slice(3)],
      ["another version", PING_SIGNATURE.replace("v1=", "v2=")],
      ["upper-case hex", PING_SIGNATURE.toUpperCase().replace("V1=", "v1=")],
      ["too short", PING_SIGNATURE.slice(0, -2)],
      ["too long", `${PING_SIGNATURE}00`],
      ["not hex", `v1=${"z".repeat(64)}`],
    ])("rejects a %s signature header without throwing", (_label, header) => {
      expect(verifySignature(secret, PING, header as string | undefined)).toBe(false);
    });
  });

  describe("secrets", () => {
    it("generates a 32-byte base64url secret that decodes back", () => {
      const generated = generateAcademySecret();
      expect(generated).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(decodeAcademySecret(generated)).toHaveLength(32);
      expect(generateAcademySecret()).not.toBe(generated);
    });

    it("decodes the documented test secret", () => {
      expect(decodeAcademySecret(SECRET_B64URL)).toEqual(secret);
    });

    it.each([["too short", "abc"], ["standard base64 alphabet", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8+"], ["empty", ""], ["spaces", "AAECAwQFBgcICQoLDA0ODxAREhMU FRYXGBkaGxwdHh8"]])(
      "refuses a %s secret",
      (_label, value) => {
        expect(decodeAcademySecret(value)).toBeNull();
      },
    );
  });
});
