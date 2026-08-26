import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BankStatementPort, RawBankFeedTransaction } from "../ports/bank-statement.port";

/**
 * Provider-agnostic HTTP "list transactions" config, sourced from a
 * `set_integration_config` row of `kind='BANK'`. Same "configure, don't
 * hardcode" shape `GenericHttpSmsAdapter` already proves out — works with
 * any bank/aggregator (e.g. an Open Banking-style API) that exposes a JSON
 * REST endpoint listing transactions, without any per-bank code. `accountId`
 * ties ONE config row to ONE `bank_account` (`set_integration_config` has no
 * `bank_account_id` DB column — every kind's config is a generic jsonb blob
 * — so this is the field `BankFeedAdapterResolverService` matches on when
 * resolving "which enabled BANK config feeds THIS account").
 */
export interface GenericHttpBankFeedConfig {
  /** The real `bank_account.id` this config's feed applies to. */
  accountId: string;
  /** Full URL, `{{since}}` substituted with the caller's own `since` date (`YYYY-MM-DD`) before the request is sent, e.g. `https://api.example.com/v1/accounts/123/transactions?since={{since}}`. */
  endpoint: string;
  method?: "GET" | "POST";
  authHeaderName?: string;
  authHeaderValue?: string;
  /** Dot-path into the parsed JSON response to the transactions array — omit when the response IS the array itself. */
  transactionsPath?: string;
  /** Field name within each transaction object carrying its date. */
  dateField: string;
  descriptionField: string;
  /** Field name carrying the signed amount (positive = money in, negative = money out) — see `RawBankFeedTransaction.amount`'s own doc comment. */
  amountField: string;
  refField?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class GenericHttpBankFeedAdapter implements BankStatementPort {
  constructor(private readonly config: GenericHttpBankFeedConfig) {}

  async fetchTransactions(since: string): Promise<RawBankFeedTransaction[]> {
    const responseText = await this.request(since);
    const parsed = safeParseJson(responseText);
    const list = this.config.transactionsPath ? readPath(parsed, this.config.transactionsPath) : parsed;
    if (!Array.isArray(list)) {
      throw new Error(
        `GenericHttpBankFeedAdapter: expected an array at ${this.config.transactionsPath ?? "(response root)"}, got ${typeof list}`,
      );
    }
    return list.map((row) => this.mapRow(row));
  }

  private mapRow(row: unknown): RawBankFeedTransaction {
    const obj = row as Record<string, unknown>;
    const ref = this.config.refField ? obj[this.config.refField] : undefined;
    return {
      date: String(obj[this.config.dateField] ?? ""),
      description: String(obj[this.config.descriptionField] ?? ""),
      amount: String(obj[this.config.amountField] ?? "0"),
      ref: ref === undefined || ref === null ? undefined : String(ref),
    };
  }

  private request(since: string): Promise<string> {
    const url = new URL(this.config.endpoint.replaceAll("{{since}}", encodeURIComponent(since)));
    const isHttps = url.protocol === "https:";
    const doRequest = isHttps ? httpsRequest : httpRequest;
    const headers: Record<string, string> = {};
    if (this.config.authHeaderName && this.config.authHeaderValue) {
      headers[this.config.authHeaderName] = this.config.authHeaderValue;
    }

    return new Promise<string>((resolve, reject) => {
      const req = doRequest(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: this.config.method ?? "GET",
          headers,
          timeout: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const responseText = Buffer.concat(chunks).toString("utf8");
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) {
              resolve(responseText);
            } else {
              reject(new Error(`Bank feed endpoint responded ${status}: ${responseText.slice(0, 500)}`));
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`Bank feed request timed out after ${this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)));
      req.on("error", reject);
      req.end();
    });
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

/** Reads a `a.b.c`-style dot-path out of a parsed JSON value; returns `undefined` if any segment is missing — same helper `GenericHttpSmsAdapter` uses. */
function readPath(value: unknown, path: string): unknown {
  let cursor: unknown = value;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}
