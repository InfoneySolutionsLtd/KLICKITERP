import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import {
  academyNetworkErrorDetail,
  AcademyGatewayException,
  describeAcademyNetworkError,
} from "../../../shared/exceptions/academy-gateway.exception";

const REQUEST_TIMEOUT_MS = 30_000;

/** Same schedule as `licensing`'s client (the Academy spec's own: "1s, 2s, 4s, and 8s") — 4 retries, 5 attempts in all. */
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];

interface RawHttpResult {
  status: number;
  body: string;
}

/** Every Academy Gateway response, success or error, is wrapped as `{success, message, data}`. */
interface AcademyEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export type AcademyQuery = Record<string, string | number | boolean | undefined | null>;

/**
 * Server-to-server HTTP for the Academy Gateway, authenticated by the school's `X-ERP-API-Key`, for the ERP's data
 * sync (student pull today; invoice/receipt push next). It is the sibling of `licensing`'s `AcademyGatewayClient`,
 * which owns onboarding and the licence check and cannot be imported from here (`licensing` is structurally isolated);
 * the envelope handling and retry rules are deliberately identical so the two behave the same against the same
 * gateway.
 *
 * Retry policy: network errors, `429` and `5xx` retry on the backoff schedule; `400/401/404` throw at once (a bad
 * request or a rejected key will not get better). Only idempotent calls should go through here — a retry after a
 * timed-out POST may repeat it. Everything this module sends is an idempotent upsert keyed by the ERP's own ids.
 *
 * The API key is passed per call and is never logged.
 */
@Injectable()
export class AcademyHttpClient {
  private readonly logger = new Logger(AcademyHttpClient.name);

  constructor(private readonly config: AppConfigService) {}

  get<T>(apiKey: string, path: string, query?: AcademyQuery): Promise<T> {
    return this.requestJson<T>("GET", this.withQuery(path, query), apiKey);
  }

  post<T>(apiKey: string, path: string, body: unknown): Promise<T> {
    return this.requestJson<T>("POST", path, apiKey, body);
  }

  put<T>(apiKey: string, path: string, body: unknown): Promise<T> {
    return this.requestJson<T>("PUT", path, apiKey, body);
  }

  private withQuery(path: string, query?: AcademyQuery): string {
    if (!query) {
      return path;
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    const text = params.toString();
    return text ? `${path}?${text}` : path;
  }

  private async requestJson<T>(method: "GET" | "POST" | "PUT", path: string, apiKey: string, body?: unknown): Promise<T> {
    const maxAttempts = RETRY_BACKOFF_MS.length + 1;
    let lastError = new AcademyGatewayException("Academy Gateway request failed", null);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let raw: RawHttpResult;
      try {
        raw = await this.rawRequest(method, path, apiKey, body);
      } catch (networkError) {
        // The admin sees `lastError.message` in the browser, so it is plain words; Node's own text (hosts, addresses) stays in the log.
        lastError = new AcademyGatewayException(describeAcademyNetworkError(networkError), null);
        this.logger.warn(`${method} ${path.split("?")[0]} got no answer from the Academy: ${academyNetworkErrorDetail(networkError)}`);
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
          );
        }
        return envelope.data as T;
      }

      const parsedBody = this.safeParseBody(raw.body);
      lastError = new AcademyGatewayException(
        this.extractErrorMessage(parsedBody) ?? `Academy Gateway responded ${raw.status} for ${method} ${path}`,
        raw.status,
      );
      if (this.shouldRetry(raw.status, attempt, maxAttempts)) {
        await this.backoffAndLog(attempt, lastError.message);
        continue;
      }
      this.logger.warn(`${lastError.message} (${method} ${path.split("?")[0]}, academyStatus=${raw.status})`);
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

  /** Extracted so tests can skip the real wait while still asserting the schedule. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private safeParseBody(body: string): unknown {
    try {
      return JSON.parse(body);
    } catch {
      return body.slice(0, 500);
    }
  }

  private parseEnvelope<T>(body: string, method: string, path: string): AcademyEnvelope<T> {
    try {
      return JSON.parse(body) as AcademyEnvelope<T>;
    } catch {
      throw new AcademyGatewayException(
        `Academy Gateway returned an unparsable response body for ${method} ${path.split("?")[0]}`,
        null,
      );
    }
  }

  private extractErrorMessage(parsedBody: unknown): string | null {
    if (parsedBody && typeof parsedBody === "object" && "message" in parsedBody) {
      const message = (parsedBody as { message?: unknown }).message;
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
    }
    return null;
  }

  private rawRequest(method: "GET" | "POST" | "PUT", path: string, apiKey: string, body?: unknown): Promise<RawHttpResult> {
    const target = new URL(path, this.config.academyGatewayUrl);
    const isHttps = target.protocol === "https:";
    const doRequest = isHttps ? httpsRequest : httpRequest;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { Accept: "application/json", "X-ERP-API-Key": apiKey };
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
          timeout: REQUEST_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        },
      );
      req.on("timeout", () => req.destroy(new Error(`Academy Gateway request timed out after ${REQUEST_TIMEOUT_MS}ms`)));
      req.on("error", (error) => reject(error));
      if (payload !== undefined) {
        req.write(payload);
      }
      req.end();
    });
  }
}
