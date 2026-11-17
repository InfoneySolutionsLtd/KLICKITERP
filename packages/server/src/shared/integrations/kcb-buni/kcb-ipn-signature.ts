import { createPublicKey, createVerify, KeyObject } from "node:crypto";
import { ValidationException } from "../../exceptions/validation.exception";

/**
 * KCB signs every payment notification it sends us: the `Signature` header is the base64 of an RSA
 * SHA-256 signature (`SHA256withRSA`, PKCS#1 v1.5) of the request body, made with KCB's PRIVATE key. We hold only
 * KCB's PUBLIC key, so we can prove a notification came from KCB and was not altered — but we can never forge one.
 * This is what stops anyone who learns our callback address from posting a fake "fees paid" notification.
 */

/**
 * Builds a key object from what an admin pastes: a PEM public key (`BEGIN PUBLIC KEY`), an X.509 certificate
 * (`BEGIN CERTIFICATE`), or a bare base64 body with no header lines. Literal `\n` sequences (a PEM squashed onto one
 * line by a single-line field) are turned back into line breaks first.
 */
export function loadKcbPublicKey(pem: string): KeyObject {
  let text = pem.trim().replace(/\\n/g, "\n");
  if (!text.includes("-----BEGIN")) {
    const body = text.replace(/\s+/g, "");
    text = `-----BEGIN PUBLIC KEY-----\n${body.replace(/(.{64})/g, "$1\n")}\n-----END PUBLIC KEY-----`;
  }
  try {
    return createPublicKey(text);
  } catch {
    throw new ValidationException("KCB BUNI config: 'ipnPublicKeyPem' is not a valid public key or certificate");
  }
}

/**
 * True when `signature` is a valid SHA256withRSA signature of the body. The raw bytes KCB sent are tried first (what
 * a signature is normally made over); if KCB signed a re-serialized form of the same JSON (compact, no whitespace),
 * that is accepted too. Both need KCB's private key to produce, so accepting both does not weaken the check.
 */
export function verifyKcbSignature(publicKey: KeyObject, signature: string, rawBody: Buffer | undefined, parsedBody: unknown): boolean {
  const signatureBytes = decodeSignature(signature);
  if (signatureBytes.length === 0) return false;

  const candidates: Array<Buffer | string> = [];
  if (rawBody && rawBody.length > 0) candidates.push(rawBody);
  try {
    candidates.push(JSON.stringify(parsedBody));
  } catch {
    // an unserializable body cannot have been signed in this form
  }

  return candidates.some((data) => {
    try {
      return createVerify("RSA-SHA256").update(data).verify(publicKey, signatureBytes);
    } catch {
      return false;
    }
  });
}

/** Accepts standard or URL-safe base64, with or without padding/whitespace. */
function decodeSignature(signature: string): Buffer {
  const cleaned = signature.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return Buffer.alloc(0);
  return Buffer.from(cleaned, "base64");
}
