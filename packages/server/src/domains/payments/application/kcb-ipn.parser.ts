import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PayBankIpnKind } from "../domain/pay-bank-ipn.entity";

/**
 * Turns the two JSON bodies KCB BUNI's Instant Payment Notification API posts into one internal shape.
 * Field names and examples come from KCB's published API definition (sandbox portal, 2026-11):
 *
 *  - `POST /account-notification` — a flat object for money credited to a KCB account (`transactionReference`,
 *    `transactionAmount`, `customerReference`, `creditAccountIdentifier`, ...);
 *  - `POST /till-notification`    — a `{ header, requestPayload }` envelope for a Paybill / Lipa na KCB till
 *    (M-Pesa) payment; the payer's reference is `additionalData.notificationData.businessKey`.
 *
 * Pure functions, no I/O. Anything that cannot be stored safely (no bank reference, an amount that is not a positive
 * number) is rejected with a `ValidationException` BEFORE it touches the database; everything merely cosmetic
 * (a timestamp in an unexpected format) falls back instead of rejecting a real payment.
 */

export interface ParsedBankNotification {
  kind: PayBankIpnKind;
  /** The bank's own transaction id — the idempotency key. */
  externalRef: string;
  amount: Money;
  currency: string;
  customerReference: string | null;
  payerName: string | null;
  /** Full number, as sent. Masked before it is stored on the log row. */
  payerMsisdn: string | null;
  narration: string | null;
  creditAccount: string | null;
  tillNumber: string | null;
  transactionAt: Date;
  /** The whole body, verbatim. */
  raw: Record<string, unknown>;
}

const MAX_REF_LENGTH = 60;
/** East Africa Time (UTC+3, no daylight saving) — how KCB writes the timestamps that carry no zone. */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

export function parseAccountNotification(body: unknown): ParsedBankNotification {
  const record = asRecord(body, "body");
  return {
    kind: "ACCOUNT",
    externalRef: requireRef(record.transactionReference, "transactionReference"),
    amount: requirePositiveAmount(record.transactionAmount, "transactionAmount"),
    currency: asText(record.currency, 3)?.toUpperCase() ?? "KES",
    customerReference: asText(record.customerReference, 100),
    payerName: asText(record.customerName, 150),
    payerMsisdn: asText(record.customerMobileNumber, 20),
    narration: asText(record.narration, 255),
    creditAccount: asText(record.creditAccountIdentifier, 40),
    tillNumber: asText(record.tillNumber, 40),
    transactionAt: parseTimestamp(asText(record.timestamp, 40)) ?? new Date(),
    raw: record,
  };
}

export function parseTillNotification(body: unknown): ParsedBankNotification {
  const record = asRecord(body, "body");
  const header = optionalRecord(record.header);
  const payload = asRecord(record.requestPayload, "requestPayload");
  const primary = optionalRecord(payload.primaryData);
  const additional = asRecord(payload.additionalData, "requestPayload.additionalData");
  const data = asRecord(additional.notificationData, "requestPayload.additionalData.notificationData");

  const payerName = [asText(data.firstName, 60), asText(data.middleName, 60), asText(data.lastName, 60)].filter(Boolean).join(" ");
  return {
    kind: "TILL",
    externalRef: requireRef(data.transactionID, "notificationData.transactionID"),
    amount: requirePositiveAmount(data.transactionAmt, "notificationData.transactionAmt"),
    currency: asText(data.currency, 3)?.toUpperCase() ?? "KES",
    customerReference: asText(data.businessKey, 100),
    payerName: payerName || null,
    payerMsisdn: asText(data.debitMSISDN, 20),
    narration: asText(data.narration, 255),
    creditAccount: null,
    tillNumber: asText(primary?.businessKey, 40),
    transactionAt: parseJavaDate(asText(data.transactionDate, 60)) ?? parseTimestamp(asText(header?.timeStamp, 40)) ?? new Date(),
    raw: record,
  };
}

/** The calendar date (`YYYY-MM-DD`) of an instant in Nairobi — what a school's receipt date means. */
export function nairobiDate(instant: Date): string {
  return new Date(instant.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

// ---- helpers ----

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationException(`Bank notification validation failed: '${field}' must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** A trimmed, length-capped string; `null` for anything absent, empty, or not a string/number. */
function asText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function requireRef(value: unknown, field: string): string {
  const text = asText(value, 1000);
  if (!text) throw new ValidationException(`Bank notification validation failed: '${field}' is required`);
  if (text.length > MAX_REF_LENGTH) {
    throw new ValidationException(`Bank notification validation failed: '${field}' is longer than ${MAX_REF_LENGTH} characters`);
  }
  return text;
}

function requirePositiveAmount(value: unknown, field: string): Money {
  const text = asText(value, 40);
  // Plain decimal only: no thousands separators, no signs, no exponents — this is money.
  if (!text || !/^\d+(\.\d{1,4})?$/.test(text)) {
    throw new ValidationException(`Bank notification validation failed: '${field}' must be a positive amount`);
  }
  const amount = Money.fromDecimalString(text);
  if (!amount.isPositive()) {
    throw new ValidationException(`Bank notification validation failed: '${field}' must be greater than zero`);
  }
  return amount;
}

/** `yyyyMMddHHmm` or `yyyyMMddHHmmss` (EAT), or an ISO-8601 string. */
function parseTimestamp(raw: string | null): Date | null {
  if (!raw) return null;
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/.exec(raw);
  if (compact) {
    const [, year, month, day, hour, minute, second] = compact;
    return validDate(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? 0)) - EAT_OFFSET_MS);
  }
  if (raw.includes("T")) return validDate(Date.parse(raw));
  return null;
}

/** Java's `Date.toString()` as KCB sends it: `Mon May 19 13:30:54 EAT 2025`. */
function parseJavaDate(raw: string | null): Date | null {
  if (!raw) return null;
  const match = /^\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\w+) (\d{4})$/.exec(raw);
  if (!match) return null;
  const [, monthName, day, hour, minute, second, zone, year] = match;
  const month = MONTHS[monthName];
  if (month === undefined) return null;
  // Only East Africa Time is understood; any other zone name is not guessed at.
  if (zone !== "EAT") return null;
  return validDate(Date.UTC(Number(year), month, Number(day), Number(hour), Number(minute), Number(second)) - EAT_OFFSET_MS);
}

function validDate(epochMs: number): Date | null {
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? null : date;
}
