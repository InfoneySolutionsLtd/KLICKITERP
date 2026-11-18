import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Request signing between the Klickit Academy and this ERP — the Academy signs every call it makes TO the ERP
 * (`/api/v1/academy/inbound/*`), the ERP verifies. The two sides share a per-school secret handed to the ERP exactly once
 * when it registers its address with the Academy (`PUT erp/link`).
 *
 * THE SPEC (version `v1`) — the Academy's billing-service implements the same thing and both repos test it against the same
 * golden vector (`__tests__/academy-signature.spec.ts`), so it cannot drift apart silently:
 *
 * ```
 * X-Klickit-School:    <the Academy's school id>
 * X-Klickit-Timestamp: <unix seconds, integer>
 * X-Klickit-Nonce:     <16-64 chars of [A-Za-z0-9_-], never reused>
 * X-Klickit-Signature: v1=<lowercase hex HMAC-SHA256>
 *
 * string to sign = "v1\n" + timestamp + "\n" + nonce + "\n" + METHOD + "\n" + pathAndQuery + "\n" + sha256hex(rawBody)
 * HMAC key       = the 32 secret bytes (the secret is transported base64url-encoded)
 * ```
 *
 * The method and path are inside the signature, so a signed `ping` can never be replayed as a different endpoint; the body
 * hash means a changed amount or phone number invalidates it; the timestamp window plus a single-use nonce (checked by
 * the guard against Redis) stop replays.
 */
export const ACADEMY_SIGNATURE_VERSION = "v1";
export const ACADEMY_HEADER_SCHOOL = "x-klickit-school";
export const ACADEMY_HEADER_TIMESTAMP = "x-klickit-timestamp";
export const ACADEMY_HEADER_NONCE = "x-klickit-nonce";
export const ACADEMY_HEADER_SIGNATURE = "x-klickit-signature";

/** How far the sender's clock may differ from ours, either way. */
export const ACADEMY_MAX_CLOCK_SKEW_SECONDS = 300;
export const ACADEMY_NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const ACADEMY_SECRET_BYTES = 32;

export interface SignableRequest {
  /** Unix seconds as a decimal string. */
  timestamp: string;
  nonce: string;
  method: string;
  /** The path exactly as the ERP receives it, query string included: `/api/v1/academy/inbound/ping`. */
  pathAndQuery: string;
  /** The raw request bytes; empty for a GET. */
  body: Buffer | string;
}

export function buildStringToSign(request: SignableRequest): string {
  const bodyHash = createHash("sha256").update(request.body).digest("hex");
  return [ACADEMY_SIGNATURE_VERSION, request.timestamp, request.nonce, request.method.toUpperCase(), request.pathAndQuery, bodyHash].join("\n");
}

/** `v1=<hex>` — what goes in `X-Klickit-Signature`. */
export function signRequest(secret: Buffer, request: SignableRequest): string {
  return `${ACADEMY_SIGNATURE_VERSION}=${createHmac("sha256", secret).update(buildStringToSign(request), "utf8").digest("hex")}`;
}

/** Constant-time comparison; false for anything that is not a well-formed `v1=<64 hex>` header. */
export function verifySignature(secret: Buffer, request: SignableRequest, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !/^v1=[0-9a-f]{64}$/.test(signatureHeader)) {
    return false;
  }
  const expected = Buffer.from(signRequest(secret, request), "utf8");
  const received = Buffer.from(signatureHeader, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** A fresh shared secret, base64url — what the Academy generates and the ERP stores encrypted. Used here by tests and fakes. */
export function generateAcademySecret(): string {
  return randomBytes(ACADEMY_SECRET_BYTES).toString("base64url");
}

/** The secret's bytes, or `null` if it is not exactly 32 bytes of valid base64url. */
export function decodeAcademySecret(secret: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(secret)) {
    return null;
  }
  const bytes = Buffer.from(secret, "base64url");
  return bytes.length === ACADEMY_SECRET_BYTES ? bytes : null;
}
