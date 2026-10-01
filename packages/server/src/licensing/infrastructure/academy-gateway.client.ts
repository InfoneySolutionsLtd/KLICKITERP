import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../../shared/config/app-config.service";
import { AcademyGatewayException } from "../../shared/exceptions/academy-gateway.exception";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Spec's own documented retry schedule: "1s, 2s, 4s, and 8s" — 4 retries, 5 attempts total. */
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];

export interface AcademyStartOnboardingResponse {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  refId: string;
  expiresInMinutes: number;
  message: string;
  email: string;
  phoneNumber: string;
  emailSent: boolean;
  smsSent: boolean;
}

export interface AcademyVerifyOnboardingResponse {
  school: {
    id: string;
    schoolName: string;
    schoolCode: string;
    schoolType: string;
    schoolStatus: string;
    countryId: string;
    region: string;
    contactEmail: string;
    contactPhone: string;
    configComplete: boolean;
    /** Confirmed live — several fields beyond the original spec doc. All optional: not guaranteed present for every school. */
    schoolWebsite?: string;
    letterHeadUrl?: string;
    docLetterHead?: string;
    baseLetterhead?: string;
    principleName?: string;
    principleEmail?: string;
    principlePhone?: string;
    addressCounty?: string;
    addressCity?: string;
    addressLine?: string;
  };
  administrator: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  /** Returned exactly once by Academy — callers must store it (encrypted) and never log/forward it. */
  apiKey: string;
  apiKeyWarning: string;
}

export interface AcademyEntitlementResponse {
  schoolId: string;
  product: string;
  allowed: boolean;
  status: string;
  expiresAt: string | null;
  subscriptionId: string | null;
  checkedAt: string;
}

interface RawHttpResult {
  status: number;
  body: string;
}

/**
 * The REAL Academy Gateway wraps every response — success AND error — in
 * this envelope (confirmed live against `https://api.infoneysolutions.com`,
 * both a real `onboarding/start` success and a real `401` error come back
 * shaped this way), which the original spec document didn't show: the
 * actual payload lives under `.data`, not at the top level. `success` can
 * in principle be `false` on an HTTP 2xx too (not yet observed, but the
 * field exists specifically to carry logical failures independently of
 * HTTP status) — treated as a real failure either way.
 */
interface AcademyEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
}

/**
 * Server-to-server-only client for the Academy Gateway (spec: "All requests
 * must be made server-to-server. Never expose API keys in browser code.") —
 * `AppConfigService.academyGatewayUrl` (`ACADEMY_GATEWAY_URL`), read lazily
 * per call so a changed env var takes effect without re-injecting this
 * client. Built on Node's raw `http`/`https` modules, the same precedent
 * `domains/integrations/infrastructure/webhook-http-client.ts` already set
 * for "injectable, mockable in tests, no new HTTP library dependency."
 *
 * Retry policy, per the spec's own error table: `429`/`5xx`/network errors
 * retry on the documented 1s/2s/4s/8s backoff; `400`/`401`/`404` throw
 * immediately, no retry ("Do not retry invalid OTPs or invalid API keys").
 */
@Injectable()
export class AcademyGatewayClient {
  private readonly logger = new Logger(AcademyGatewayClient.name);

  constructor(private readonly config: AppConfigService) {}

  async startOnboarding(schoolCode: string): Promise<AcademyStartOnboardingResponse> {
    return this.requestJson<AcademyStartOnboardingResponse>("POST", "/schools/erp/onboarding/start", { schoolCode });
  }

  async verifyOnboarding(schoolId: string, refId: string, code: string): Promise<AcademyVerifyOnboardingResponse> {
    return this.requestJson<AcademyVerifyOnboardingResponse>("POST", "/schools/erp/onboarding/verify", {
      schoolId,
      refId,
      code,
    });
  }

  async getEntitlement(apiKey: string): Promise<AcademyEntitlementResponse> {
    return this.requestJson<AcademyEntitlementResponse>("GET", "/erp/entitlement", undefined, {
      "X-ERP-API-Key": apiKey,
    });
  }

  private async requestJson<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const maxAttempts = RETRY_BACKOFF_MS.length + 1;
    let lastError = new AcademyGatewayException("Academy Gateway request failed", null);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let raw: RawHttpResult;
      try {
        raw = await this.rawRequest(method, path, body, extraHeaders);
      } catch (networkError) {
        lastError = new AcademyGatewayException(this.describeNetworkError(networkError), null);
        if (this.shouldRetry(null, attempt, maxAttempts)) {
          await this.backoffAndLog(attempt, lastError.message);
          continue;
        }
        throw lastError;
      }

      if (raw.status >= 200 && raw.status < 300) {
        const envelope = this.parseEnvelope<T>(raw.body, method, path);
        if (!envelope.success) {
          throw new AcademyGatewayException(
            envelope.message || `Academy Gateway reported failure for ${method} ${path}`,
            raw.status,
            envelope,
          );
        }
        return envelope.data as T;
      }

      const parsedBody = this.safeParseBody(raw.body);
      lastError = new AcademyGatewayException(
        this.extractErrorMessage(parsedBody) ?? `Academy Gateway responded ${raw.status} for ${method} ${path}`,
        raw.status,
        parsedBody,
      );
      if (this.shouldRetry(raw.status, attempt, maxAttempts)) {
        await this.backoffAndLog(attempt, lastError.message);
        continue;
      }
      // Non-retryable (400/401/404) — logged here specifically because these
      // never reach backoffAndLog()'s own logging, so without this line a
      // real Academy rejection (e.g. "Invalid or expired OTP") would be
      // completely silent in the server logs, visible only in whatever
      // response body the BROWSER happened to capture — a real, previously-
      // unnoticed diagnostic gap, found while troubleshooting a live
      // deployment's "invalid code" report that needed the actual Academy
      // response text to investigate.
      this.logger.warn(`${lastError.message} (${method} ${path}, academyStatus=${raw.status})`);
      throw lastError;
    }

    throw lastError;
  }

  private shouldRetry(status: number | null, attempt: number, maxAttempts: number): boolean {
    if (attempt >= maxAttempts - 1) {
      return false;
    }
    return status === null || status === 429 || status >= 500;
  }

  private async backoffAndLog(attempt: number, message: string): Promise<void> {
    const delayMs = RETRY_BACKOFF_MS[attempt];
    this.logger.warn(`${message} — retrying in ${delayMs}ms (attempt ${attempt + 1}/${RETRY_BACKOFF_MS.length})`);
    await this.sleep(delayMs);
  }

  /** Extracted so tests can stub out the real wait while still asserting the backoff schedule (`sleep` call args). */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Node's own connection-level errors (confirmed live, this environment:
   * `ECONNREFUSED` against an unreachable `ACADEMY_GATEWAY_URL`) can carry a
   * genuinely EMPTY `.message` while `.code` is populated — a real, previously-
   * unseen gap that made every "Academy Gateway unreachable" failure surface
   * as a blank error message end to end (API response, log line). Falls back
   * to `.code`, then a generic description, so the exception is always
   * informative.
   */
  private describeNetworkError(error: unknown): string {
    const err = error as NodeJS.ErrnoException;
    if (err.message && err.message.length > 0) {
      return err.message;
    }
    if (err.code) {
      return `Academy Gateway unreachable (${err.code})`;
    }
    return "Academy Gateway unreachable";
  }

  private safeParseBody(body: string): unknown {
    try {
      return JSON.parse(body);
    } catch {
      return body.slice(0, 500);
    }
  }

  /** Parses a 2xx body as the real `{success, message, data}` envelope every endpoint actually uses — a malformed/non-JSON 2xx body is itself a gateway-side bug, surfaced as a clear exception rather than a raw `SyntaxError`. */
  private parseEnvelope<T>(body: string, method: "GET" | "POST", path: string): AcademyEnvelope<T> {
    try {
      return JSON.parse(body) as AcademyEnvelope<T>;
    } catch {
      throw new AcademyGatewayException(
        `Academy Gateway returned an unparsable response body for ${method} ${path}`,
        null,
        body.slice(0, 500),
      );
    }
  }

  /** Error bodies use the same `{success, message, data}` envelope (confirmed live: a real 401 came back `{"success":false,"message":"Invalid or inactive ERP API key","data":null}`) — prefer the real message over a generic one whenever the body actually has one. */
  private extractErrorMessage(parsedBody: unknown): string | null {
    if (parsedBody && typeof parsedBody === "object" && "message" in parsedBody) {
      const message = (parsedBody as { message?: unknown }).message;
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
    }
    return null;
  }

  private rawRequest(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    extraHeaders: Record<string, string>,
  ): Promise<RawHttpResult> {
    const target = new URL(path, this.config.academyGatewayUrl);
    const isHttps = target.protocol === "https:";
    const doRequest = isHttps ? httpsRequest : httpRequest;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { Accept: "application/json", ...extraHeaders };
    if (payload !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload).toString();
    }

    return new Promise<RawHttpResult>((resolve, reject) => {
      const req = doRequest(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || (isHttps ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          method,
          headers,
          timeout: DEFAULT_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        },
      );
      req.on("timeout", () => req.destroy(new Error(`Academy Gateway request timed out after ${DEFAULT_TIMEOUT_MS}ms`)));
      req.on("error", (error) => reject(error));
      if (payload !== undefined) {
        req.write(payload);
      }
      req.end();
    });
  }
}
