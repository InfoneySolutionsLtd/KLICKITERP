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
