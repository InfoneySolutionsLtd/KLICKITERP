import { ValidationException } from "../../exceptions/validation.exception";

/**
 * Credentials / settings for the school's KCB BUNI developer-portal application, stored (encrypted) as a
 * `set_integration_config` row of `kind='BANK'` whose decrypted JSON has `provider: "KCB_BUNI"` — the same
 * "configure, don't hardcode" shape the other adapters follow. A `BANK` row WITHOUT this `provider` is the older
 * generic HTTP statement-feed config (`GenericHttpBankFeedConfig`); the two are told apart by `provider`.
 *
 * What was learned from the KCB BUNI portal (sandbox, 2026-11):
 *  - it is a WSO2 API Manager; tokens come from a separate identity host (`accounts.buni.kcbgroup.com`) using the
 *    OAuth2 **client-credentials** grant (HTTP Basic = consumer key : consumer secret), valid for 3600 s;
 *  - the APIs themselves are served from `https://uat.buni.kcbgroup.com/...` — NOT from `sandbox.buni.kcbgroup.com`,
 *    which is only the developer portal.
 */
export const KCB_BUNI_PROVIDER = "KCB_BUNI";

export const KCB_BUNI_SANDBOX_TOKEN_URL = "https://accounts.buni.kcbgroup.com/oauth2/token";
export const KCB_BUNI_SANDBOX_GATEWAY_BASE_URL = "https://uat.buni.kcbgroup.com";

export type KcbBuniEnvironment = "sandbox" | "production";

export interface KcbBuniConfig {
  provider: typeof KCB_BUNI_PROVIDER;
  environment: KcbBuniEnvironment;
  /** The application's OAuth2 consumer key (client id). */
  consumerKey: string;
  /** The application's OAuth2 consumer secret. Never logged. */
  consumerSecret: string;
  /** OAuth2 token endpoint. Defaults to the sandbox one; REQUIRED for `production`. */
  tokenUrl: string;
  /** API gateway origin with no trailing slash, e.g. `https://uat.buni.kcbgroup.com`. Defaults to the sandbox one; REQUIRED for `production`. */
  gatewayBaseUrl: string;
  /**
   * KCB's PUBLIC key (PEM public key or X.509 certificate) used to verify the `Signature` header on the payment
   * notifications KCB sends us (SHA256withRSA over the request body). Without it, notifications are rejected.
   */
  ipnPublicKeyPem?: string;
  /**
   * SANDBOX ONLY escape hatch while KCB's public key is not yet available: accept notifications without checking the
   * signature. Ignored (signatures are always enforced) when the app runs with `NODE_ENV=production`.
   */
  ipnSkipSignatureVerification?: boolean;
  /** `bank_account.id` of the school's KCB account — a bank-deposit receipt must name the account it landed in. */
  bankAccountId?: string;
  /** The school's KCB account number as KCB writes it — echoed back to KCB when it asks us to validate a payment reference. */
  creditAccountNumber?: string;
  /**
   * How KCB's optional `/validation` calls (a branch/agency teller asking "is this reference real, and who is it?")
   * prove they come from KCB. KCB's published definition says nothing about it, so all three are supported:
   * `SIGNATURE` (default — same SHA256withRSA signature as the notifications), `SHARED_SECRET` (a header KCB is
   * configured to send, compared in constant time), `NONE` (sandbox only — ignored in production).
   */
  ipnValidationAuth: KcbValidationAuth;
  /** Header carrying the shared secret (`SHARED_SECRET` mode). */
  ipnValidationHeader: string;
  ipnValidationSecret?: string;
  /** KCB till / account number the M-Pesa Express prompt credits — the first half of its `invoiceNumber` (`<this>-<reference>`). */
  stkAccountNumber?: string;
  /** Public address of THIS API including its prefix (e.g. `https://erp.example.com/api/v1`) — KCB posts the STK result to `<this>/callbacks/mpesa/stk`. */
  callbackBaseUrl?: string;
  /** KCB Funds Transfer `companyCode` the school was onboarded with. */
  companyCode?: string;
  /** Funds Transfer `transactionType` (KCB's own example: `IF`). */
  fundsTransferType: string;
  /**
   * Master switch for sending money OUT through KCB. Off unless explicitly turned on; even then each transfer is a
   * deliberate action on an already approved and posted transfer.
   */
  fundsTransferEnabled: boolean;
  timeoutMs?: number;
}

export type KcbValidationAuth = "SIGNATURE" | "SHARED_SECRET" | "NONE";

const DEFAULT_TIMEOUT_MS = 15_000;

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** True for a decrypted `BANK` config that is the KCB BUNI one (as opposed to the generic HTTP statement feed). */
export function isKcbBuniConfig(raw: Record<string, unknown>): boolean {
  return raw.provider === KCB_BUNI_PROVIDER;
}

/**
 * Validates and normalizes a decrypted config. Throws a `ValidationException` naming the field (never the value) so a
 * half-filled Settings form produces a readable error instead of a failed token request later.
 */
export function parseKcbBuniConfig(raw: Record<string, unknown>): KcbBuniConfig {
  if (!isKcbBuniConfig(raw)) {
    throw new ValidationException(`KCB BUNI config: 'provider' must be "${KCB_BUNI_PROVIDER}"`);
  }
  const environment = raw.environment === "production" ? "production" : "sandbox";
  const consumerKey = asNonEmptyString(raw.consumerKey);
  const consumerSecret = asNonEmptyString(raw.consumerSecret);
  if (!consumerKey) throw new ValidationException("KCB BUNI config: 'consumerKey' is required");
  if (!consumerSecret) throw new ValidationException("KCB BUNI config: 'consumerSecret' is required");

  let tokenUrl = asNonEmptyString(raw.tokenUrl);
  let gatewayBaseUrl = asNonEmptyString(raw.gatewayBaseUrl);
  if (environment === "production") {
    if (!tokenUrl) throw new ValidationException("KCB BUNI config: 'tokenUrl' is required for the production environment");
    if (!gatewayBaseUrl) throw new ValidationException("KCB BUNI config: 'gatewayBaseUrl' is required for the production environment");
  }
  tokenUrl ??= KCB_BUNI_SANDBOX_TOKEN_URL;
  gatewayBaseUrl = (gatewayBaseUrl ?? KCB_BUNI_SANDBOX_GATEWAY_BASE_URL).replace(/\/+$/, "");

  for (const [field, value] of [
    ["tokenUrl", tokenUrl],
    ["gatewayBaseUrl", gatewayBaseUrl],
  ] as const) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new ValidationException(`KCB BUNI config: '${field}' must be a valid URL`);
    }
    // Credentials and tokens must never travel in clear text to a real bank.
    if (parsed.protocol !== "https:") throw new ValidationException(`KCB BUNI config: '${field}' must use https`);
  }

  if (raw.ipnValidationAuth === "SHARED_SECRET" && !asNonEmptyString(raw.ipnValidationSecret)) {
    throw new ValidationException("KCB BUNI config: 'ipnValidationSecret' is required when ipnValidationAuth is SHARED_SECRET");
  }
  const callbackBase = asNonEmptyString(raw.callbackBaseUrl);
  if (callbackBase) {
    let parsedCallback: URL;
    try {
      parsedCallback = new URL(callbackBase);
    } catch {
      throw new ValidationException("KCB BUNI config: 'callbackBaseUrl' must be a valid URL");
    }
    // KCB will only post a payment result to a secure address.
    if (parsedCallback.protocol !== "https:") throw new ValidationException("KCB BUNI config: 'callbackBaseUrl' must use https");
  }

  return {
    provider: KCB_BUNI_PROVIDER,
    environment,
    consumerKey,
    consumerSecret,
    tokenUrl,
    gatewayBaseUrl,
    ipnPublicKeyPem: asNonEmptyString(raw.ipnPublicKeyPem),
    ipnSkipSignatureVerification: raw.ipnSkipSignatureVerification === true,
    bankAccountId: asNonEmptyString(raw.bankAccountId),
    creditAccountNumber: asNonEmptyString(raw.creditAccountNumber),
    ipnValidationAuth: raw.ipnValidationAuth === "SHARED_SECRET" || raw.ipnValidationAuth === "NONE" ? raw.ipnValidationAuth : "SIGNATURE",
    ipnValidationHeader: (asNonEmptyString(raw.ipnValidationHeader) ?? "x-api-key").toLowerCase(),
    ipnValidationSecret: asNonEmptyString(raw.ipnValidationSecret),
    stkAccountNumber: asNonEmptyString(raw.stkAccountNumber),
    callbackBaseUrl: asNonEmptyString(raw.callbackBaseUrl)?.replace(/\/+$/, ""),
    companyCode: asNonEmptyString(raw.companyCode),
    fundsTransferType: asNonEmptyString(raw.fundsTransferType) ?? "IF",
    fundsTransferEnabled: raw.fundsTransferEnabled === true,
    timeoutMs: typeof raw.timeoutMs === "number" && raw.timeoutMs > 0 ? raw.timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}
