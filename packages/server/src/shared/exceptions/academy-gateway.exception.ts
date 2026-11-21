import { DomainException } from "./domain-exception";

/**
 * Wraps a non-2xx response from the external Academy Gateway
 * (`licensing/infrastructure/academy-gateway.client.ts`). `academyStatus` is
 * the raw HTTP status Academy returned (400/401/404/429/5xx per its own
 * spec's error table) — kept distinct from `httpStatus` (what THIS api
 * returns to its own caller) because a 429/5xx from Academy, once retries
 * are exhausted, still surfaces to our own caller as a 503 ("upstream
 * unavailable"), not a literal passthrough of Academy's status code.
 */
export class AcademyGatewayException extends DomainException {
  readonly code = "ACADEMY_GATEWAY_ERROR";
  readonly httpStatus: number;

  constructor(
    message: string,
    readonly academyStatus: number | null,
    details?: unknown,
  ) {
    super(message, details);
    // 400/401/404 are the caller's own problem (bad payload, bad/expired OTP, unknown school/key) —
    // pass the real status through. 429/5xx/unreachable (null) become a 503: our own caller didn't
    // do anything wrong, Academy is just unavailable right now.
    this.httpStatus = academyStatus === 400 || academyStatus === 401 || academyStatus === 404 ? academyStatus : 503;
  }
}

/** Certificate problems that mean "the Academy's address answered, but this ERP will not trust who answered". */
const CERTIFICATE_NOT_TRUSTED = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_NOT_YET_VALID",
  "CERT_UNTRUSTED",
]);

function networkCode(error: unknown): string | null {
  const code = (error as NodeJS.ErrnoException | null | undefined)?.code;
  return typeof code === "string" && code.length > 0 ? code : null;
}

function networkText(error: unknown): string {
  const message = (error as Error | null | undefined)?.message;
  return typeof message === "string" ? message : "";
}

/**
 * What to tell the person who clicked, when the Academy could not be reached at all (no HTTP answer came back).
 *
 * The admin sees this in the browser (the web shows an `ACADEMY_GATEWAY_ERROR` message as written), so it says what is wrong in
 * plain words and carries only the error code for support, never Node's own text, which names hosts and addresses. The full
 * technical detail goes to the log through `academyNetworkErrorDetail`. Always a sentence, even for a Node error with an
 * empty `.message` and only a `.code` (the real shape of `ECONNREFUSED` on this platform).
 */
export function describeAcademyNetworkError(error: unknown): string {
  const code = networkCode(error);
  const text = networkText(error);
  const said = (sentence: string): string => (code ? `${sentence} (${code})` : sentence);

  if (code === "CERT_HAS_EXPIRED") {
    return said("The Klickit Academy's security certificate has expired, so this ERP will not trust the connection.");
  }
  if (code !== null && CERTIFICATE_NOT_TRUSTED.has(code)) {
    return said("The Klickit Academy's security certificate could not be verified, so this ERP will not trust the connection.");
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return said("The Klickit Academy's address could not be found. Check the Academy address this ERP is set to use.");
  }
  if (code === "ECONNREFUSED") {
    return said("The Klickit Academy refused the connection. It may be down for maintenance.");
  }
  if (code === "ECONNRESET" || code === "EPIPE" || /socket hang up/i.test(text)) {
    return said("The connection to the Klickit Academy was interrupted.");
  }
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || /timed out/i.test(text)) {
    return said("The Klickit Academy took too long to answer.");
  }
  return said("The Klickit Academy could not be reached.");
}

/** The technical side of a failed connection (code and Node's own text), for the server log only. */
export function academyNetworkErrorDetail(error: unknown): string {
  return [networkCode(error), networkText(error)].filter(Boolean).join(" ") || "no detail";
}
