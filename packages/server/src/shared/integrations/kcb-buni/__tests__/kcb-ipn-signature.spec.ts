import { createSign, generateKeyPairSync } from "node:crypto";
import { loadKcbPublicKey, verifyKcbSignature } from "../kcb-ipn-signature";

// A throwaway key pair stands in for KCB's: the private half signs like KCB would, the public half is what we hold.
const kcb = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = kcb.publicKey.export({ type: "spki", format: "pem" }).toString();

const BODY = JSON.stringify({ transactionReference: "FT000262556", transactionAmount: "1000", customerReference: "1234" });

function sign(data: string | Buffer, privateKey = kcb.privateKey): string {
  return createSign("RSA-SHA256").update(data).sign(privateKey).toString("base64");
}

describe("verifyKcbSignature", () => {
  const key = loadKcbPublicKey(publicPem);

  it("accepts a genuine signature over the exact bytes received", () => {
    expect(verifyKcbSignature(key, sign(BODY), Buffer.from(BODY), JSON.parse(BODY))).toBe(true);
  });

  it("rejects a body that was altered after signing (amount changed)", () => {
    const tampered = BODY.replace('"1000"', '"100000"');
    expect(verifyKcbSignature(key, sign(BODY), Buffer.from(tampered), JSON.parse(tampered))).toBe(false);
  });

  it("rejects a signature made with a different private key (a forger)", () => {
    expect(verifyKcbSignature(key, sign(BODY, other.privateKey), Buffer.from(BODY), JSON.parse(BODY))).toBe(false);
  });

  it("accepts a signature over the compact re-serialization when the bytes we received were pretty-printed", () => {
    const pretty = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyKcbSignature(key, sign(BODY), Buffer.from(pretty), JSON.parse(pretty))).toBe(true);
  });

  it("works without the raw bytes (falls back to the parsed body)", () => {
    expect(verifyKcbSignature(key, sign(BODY), undefined, JSON.parse(BODY))).toBe(true);
  });

  it("accepts URL-safe base64 and stray whitespace in the header", () => {
    const urlSafe = sign(BODY).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(verifyKcbSignature(key, `  ${urlSafe}\n`, Buffer.from(BODY), JSON.parse(BODY))).toBe(true);
  });

  it("rejects an empty, malformed or non-base64 signature without throwing", () => {
    for (const bad of ["", "   ", "not*base64!", "AAAA"]) {
      expect(verifyKcbSignature(key, bad, Buffer.from(BODY), JSON.parse(BODY))).toBe(false);
    }
  });
});

describe("loadKcbPublicKey", () => {
  it("loads a PEM public key", () => {
    expect(loadKcbPublicKey(publicPem).type).toBe("public");
  });

  it("loads a PEM squashed onto one line with literal \\n sequences", () => {
    expect(loadKcbPublicKey(publicPem.replace(/\n/g, "\\n")).type).toBe("public");
  });

  it("loads a bare base64 body with no header lines", () => {
    const bare = publicPem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
    const loaded = loadKcbPublicKey(bare);
    expect(verifyKcbSignature(loaded, sign(BODY), Buffer.from(BODY), JSON.parse(BODY))).toBe(true);
  });

  it("explains a key that cannot be parsed, without echoing it", () => {
    expect(() => loadKcbPublicKey("definitely not a key")).toThrow(/ipnPublicKeyPem.*not a valid public key/);
  });
});
