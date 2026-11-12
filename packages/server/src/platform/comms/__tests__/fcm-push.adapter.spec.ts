import { generateKeyPairSync } from "node:crypto";
import { FcmPushAdapter, normalizeFcmPrivateKey } from "../infrastructure/adapters/fcm-push.adapter";

/** A real, throwaway RSA key in the PKCS#8 PEM form Firebase service accounts use. */
const { privateKey: PEM } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const PEM_TRIMMED = PEM.trim();

const serviceAccountJson = (privateKey: string) =>
  JSON.stringify({
    type: "service_account",
    project_id: "my-project",
    private_key_id: "abc123",
    private_key: privateKey,
    client_email: "firebase-adminsdk@my-project.iam.gserviceaccount.com",
  });

describe("normalizeFcmPrivateKey", () => {
  it("passes a bare PEM through unchanged (trimmed)", () => {
    expect(normalizeFcmPrivateKey(`\n  ${PEM}\n`)).toBe(PEM_TRIMMED);
  });

  it("extracts private_key when the WHOLE service-account JSON was pasted (the reported mistake)", () => {
    expect(normalizeFcmPrivateKey(serviceAccountJson(PEM))).toBe(PEM_TRIMMED);
  });

  it("extracts it from pretty-printed JSON too", () => {
    expect(normalizeFcmPrivateKey(JSON.stringify(JSON.parse(serviceAccountJson(PEM)), null, 2))).toBe(PEM_TRIMMED);
  });

  it("un-escapes literal \\n sequences (key copied out of the JSON string)", () => {
    expect(normalizeFcmPrivateKey(PEM_TRIMMED.replace(/\n/g, "\\n"))).toBe(PEM_TRIMMED);
  });

  it("strips the JSON string's wrapping quotes as well", () => {
    expect(normalizeFcmPrivateKey(`"${PEM_TRIMMED.replace(/\n/g, "\\n")}"`)).toBe(PEM_TRIMMED);
  });

  it("normalises CRLF line endings", () => {
    expect(normalizeFcmPrivateKey(PEM_TRIMMED.replace(/\n/g, "\r\n"))).toBe(PEM_TRIMMED);
  });

  it("rejects non-keys with a message that says what to paste", () => {
    expect(() => normalizeFcmPrivateKey("not a key")).toThrow(/private_key/);
    expect(() => normalizeFcmPrivateKey('{"type":"service_account"}')).toThrow(/begins with -----BEGIN PRIVATE KEY-----/);
    expect(() => normalizeFcmPrivateKey("")).toThrow(/not a PEM private key/);
  });
});

describe("FcmPushAdapter construction", () => {
  const base = { projectId: "my-project", clientEmail: "firebase-adminsdk@my-project.iam.gserviceaccount.com" };

  it("accepts a whole pasted service-account JSON as the privateKey", async () => {
    const adapter = new FcmPushAdapter({ ...base, privateKey: serviceAccountJson(PEM) });
    await adapter.dispose();
  });

  it("accepts a bare PEM", async () => {
    const adapter = new FcmPushAdapter({ ...base, privateKey: PEM });
    await adapter.dispose();
  });

  it("fails with the helpful message (not OpenSSL's DECODER error) for a non-key", () => {
    expect(() => new FcmPushAdapter({ ...base, privateKey: '{ "type": "service_account" }' })).toThrow(/Paste only the "private_key" value/);
  });

  it("adds the same guidance when a PEM-looking value is still unparseable", () => {
    const mangled = "-----BEGIN PRIVATE KEY-----\nnot-really-base64!!\n-----END PRIVATE KEY-----";
    expect(() => new FcmPushAdapter({ ...base, privateKey: mangled })).toThrow(/Paste only the "private_key" value/);
  });
});
