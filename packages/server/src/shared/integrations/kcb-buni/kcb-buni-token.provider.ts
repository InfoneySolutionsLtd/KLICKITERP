import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { KcbBuniConfig } from "./kcb-buni.config";

/** Thrown when KCB's identity server will not issue a token. Carries the OAuth `error` code, never a credential. */
export class KcbBuniAuthError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
    readonly oauthError?: string,
  ) {
    super(message);
    this.name = "KcbBuniAuthError";
  }
}

export interface KcbHttpResponse {
  status: number;
  body: string;
}

/** The one outbound HTTP call this provider needs — injectable so tests never touch the network. */
export type KcbHttpPost = (url: string, headers: Record<string, string>, body: string, timeoutMs: number) => Promise<KcbHttpResponse>;

export interface KcbBuniTokenProviderDeps {
  post?: KcbHttpPost;
  /** Clock in epoch ms. */
  now?: () => number;
}

/** Refresh a little before the real expiry so a token is never used in the instant it lapses. */
const EXPIRY_SKEW_MS = 60_000;
/** Used only if the token response forgets `expires_in`; KCB's observed lifetime is 3600 s. */
const FALLBACK_LIFETIME_MS = 300_000;

/**
 * Gets (and caches) the OAuth2 access token every KCB BUNI API call needs — the client-credentials grant against
 * the portal's token endpoint, authenticated with HTTP Basic `consumerKey:consumerSecret`.
 *
 * - The token is reused until ~60 s before it expires, then refreshed.
 * - Concurrent callers share ONE in-flight request (a burst of notifications must not fire a burst of token calls).
 * - A failed request is NOT cached, so the next caller retries.
 * - Nothing secret is ever put in an error message or log: not the key, the secret, nor the token.
 *
 * Pure TypeScript (no Nest DI): payments (M-Pesa Express) and banking (Funds Transfer) can both build one from the
 * same config.
 */
export class KcbBuniTokenProvider {
  private cached: { token: string; expiresAtMs: number } | null = null;
  private inFlight: Promise<string> | null = null;
  private readonly post: KcbHttpPost;
  private readonly now: () => number;

  constructor(
    private readonly config: Pick<KcbBuniConfig, "consumerKey" | "consumerSecret" | "tokenUrl" | "timeoutMs">,
    deps: KcbBuniTokenProviderDeps = {},
  ) {
    this.post = deps.post ?? kcbHttpsPost;
    this.now = deps.now ?? Date.now;
  }

  /** A valid bearer token, fetching a fresh one when none is cached or the cached one is about to lapse. */
  async getAccessToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAtMs - EXPIRY_SKEW_MS) return this.cached.token;
    this.inFlight ??= this.fetchToken().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Forget the cached token — call after the gateway answers 401 so the next call fetches a fresh one. */
  invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString("base64");
    let response: KcbHttpResponse;
    try {
      response = await this.post(
        this.config.tokenUrl,
        { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        "grant_type=client_credentials",
        this.config.timeoutMs ?? 15_000,
      );
    } catch (error) {
      // Transport failure (DNS, TLS, timeout). The message of these errors never contains our credentials.
      throw new KcbBuniAuthError(`KCB BUNI token request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const parsed = safeJson(response.body);
    if (response.status !== 200 || typeof parsed.access_token !== "string" || !parsed.access_token) {
      const oauthError = typeof parsed.error === "string" ? parsed.error : undefined;
      const description = typeof parsed.error_description === "string" ? `: ${parsed.error_description}` : "";
      throw new KcbBuniAuthError(
        `KCB BUNI token request was refused (HTTP ${response.status}${oauthError ? `, ${oauthError}` : ""})${description}`,
        response.status,
        oauthError,
      );
    }

    const lifetimeMs = typeof parsed.expires_in === "number" && parsed.expires_in > 0 ? parsed.expires_in * 1000 : FALLBACK_LIFETIME_MS;
    this.cached = { token: parsed.access_token, expiresAtMs: this.now() + lifetimeMs };
    return parsed.access_token;
  }
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const kcbHttpsPost: KcbHttpPost = (url, headers, body, timeoutMs) =>
  new Promise<KcbHttpResponse>((resolve, reject) => {
    const target = new URL(url);
    const req = httpsRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`timed out after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end(body);
  });
