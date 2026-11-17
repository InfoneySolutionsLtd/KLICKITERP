import { KcbBuniConfig } from "./kcb-buni.config";
import { KcbBuniTokenProvider, KcbHttpPost, kcbHttpsPost } from "./kcb-buni-token.provider";

/** What came back from a KCB API call — the HTTP status plus the body parsed when it was JSON. */
export interface KcbApiResponse {
  status: number;
  json: Record<string, unknown> | null;
  text: string;
}

/** Thrown by the callers (M-Pesa Express, Funds Transfer) when KCB refuses a request; never carries a credential. */
export class KcbBuniApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
    readonly statusCode?: string,
  ) {
    super(message);
    this.name = "KcbBuniApiError";
  }
}

/**
 * Calls KCB BUNI's API gateway with a bearer token from `KcbBuniTokenProvider`. One shared way to do the two
 * things every KCB call needs: add the token, and — if the gateway says the token is no good (401: expired early,
 * revoked) — fetch a fresh one and try ONCE more.
 *
 * That single retry is only ever safe because a 401 means the gateway refused the call BEFORE doing anything. No
 * other status is retried: a timeout or a 5xx on a payment request leaves it unknown whether KCB acted, and
 * repeating it could charge or pay twice.
 */
export class KcbBuniApiClient {
  constructor(
    private readonly config: Pick<KcbBuniConfig, "gatewayBaseUrl" | "timeoutMs">,
    private readonly tokens: Pick<KcbBuniTokenProvider, "getAccessToken" | "invalidate">,
    private readonly post: KcbHttpPost = kcbHttpsPost,
  ) {}

  async postJson(path: string, body: unknown): Promise<KcbApiResponse> {
    const payload = JSON.stringify(body);
    const attempt = async (): Promise<KcbApiResponse> => {
      const token = await this.tokens.getAccessToken();
      const response = await this.post(
        `${this.config.gatewayBaseUrl}${path}`,
        { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        payload,
        this.config.timeoutMs ?? 15_000,
      );
      return { status: response.status, json: parseJsonObject(response.body), text: response.body };
    };

    const first = await attempt();
    if (first.status !== 401) return first;
    this.tokens.invalidate();
    return attempt();
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The most useful one-line reason in a KCB error body: WSO2's own `{code, message, description}` for gateway
 * refusals, or the `header.statusDescription` / `statusMessage` the KCB services use for business ones.
 */
export function describeKcbFailure(response: KcbApiResponse): string {
  const json = response.json;
  if (json) {
    const header = typeof json.header === "object" && json.header !== null ? (json.header as Record<string, unknown>) : undefined;
    for (const candidate of [header?.statusDescription, header?.statusMessage, json.description, json.message, json.errorMessage]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    // Funds Transfer's validation answers with a flat { field: "must not be blank", ... } map (field names are KCB's
    // internal ones, e.g. `retrievalRefNumber` for our `transactionReference`) — list the first few.
    const entries = Object.entries(json);
    if (entries.length > 0 && entries.every(([, value]) => typeof value === "string")) {
      return entries
        .slice(0, 4)
        .map(([field, message]) => `${field} ${message as string}`)
        .join("; ");
    }
  }
  return `HTTP ${response.status}`;
}
