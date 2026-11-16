import { Money } from "../../../../shared/money/money";
import type { ReportColumnType } from "../report-registry.service";

/**
 * Display formatting for the PDF export — the counterpart of `csv-export.util.ts`'s
 * machine-readable output. CSV keeps raw, lossless values (4-decimal money, ISO
 * timestamps) for spreadsheets; a printed report shows what a person reads:
 * grouped 2-decimal money, "31 Jul 2026" dates in the school's local timezone.
 *
 * Everything here is pure and takes the timezone explicitly (defaulting to the
 * process's own, i.e. `TZ`, which production sets to Africa/Nairobi) so it is
 * deterministic under test.
 */

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Words a camelCase key would otherwise mangle ("totalNbv" -> "Total nbv"). */
const ACRONYMS = new Set(["nbv", "ar", "ap", "gl", "id", "vat", "paye", "nhif", "nssf", "kra", "qty"]);

function groupThousands(integerPart: string): string {
  return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A Money / numeric string / number as plain decimal text, or null when it is none of those. */
function toDecimalText(value: unknown): string | null {
  if (value instanceof Money) return value.toDecimalString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(4) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return DECIMAL.test(trimmed) ? trimmed : null;
  }
  return null;
}

/**
 * "1234.5000" -> "1,234.50". Rounds half-up on the decimal STRING (never via a
 * float, so a ledger amount like 0.125 cannot drift), groups thousands, keeps the
 * sign. Unparseable input is returned as plain text rather than throwing — one odd
 * cell must never fail a whole report.
 */
export function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const text = toDecimalText(value);
  if (text === null) return String(value);
  const match = DECIMAL.exec(text);
  if (!match) return text;

  const [, sign, integerPart, fraction = ""] = match;
  let cents = BigInt(integerPart + (fraction + "00").slice(0, 2));
  if (fraction.length > 2 && fraction.charCodeAt(2) >= 53 /* '5' */) cents += 1n;

  const whole = (cents / 100n).toString();
  const remainder = (cents % 100n).toString().padStart(2, "0");
  const negative = sign === "-" && cents !== 0n;
  return `${negative ? "-" : ""}${groupThousands(whole)}.${remainder}`;
}

/** Counts / quantities: grouped, up to 4 decimals, trailing zeros trimmed ("12.5000" -> "12.5", "7" -> "7"). */
export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const text = toDecimalText(value);
  if (text === null) return String(value);
  const match = DECIMAL.exec(text);
  if (!match) return text;

  const [, sign, integerPart, fraction = ""] = match;
  const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, "");
  const isZero = /^0*$/.test(integerPart) && trimmedFraction === "";
  const body = groupThousands(integerPart.replace(/^0+(?=\d)/, ""));
  return `${sign === "-" && !isZero ? "-" : ""}${body}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

function datePartsText(date: Date, timeZone: string | undefined): { day: string; month: string; year: string; parts: Record<string, string> } {
  // en-US supplies the "Jul"/"Sep" short month names; the parts are reassembled day-first ourselves.
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return { day: parts.day, month: parts.month, year: parts.year, parts };
}

/**
 * "31 Jul 2026". A bare `YYYY-MM-DD` is a calendar date, not an instant, so it is
 * formatted as-is with NO timezone shift; a `Date` / ISO timestamp is an instant and
 * is shown in the local timezone (so a midnight-Nairobi value stored as 21:00Z the
 * previous day prints as the correct local date).
 */
export function formatDate(value: unknown, timeZone?: string): string {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "string" && DATE_ONLY.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const { day: d, month: m, year: y } = datePartsText(new Date(Date.UTC(year, month - 1, day)), "UTC");
    return `${d} ${m} ${y}`;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const { day, month, year } = datePartsText(date, timeZone);
  return `${day} ${month} ${year}`;
}

/** "16 Nov 2026, 14:32 (GMT+3)" — the generation stamp printed on every page. */
export function formatDateTime(date: Date, timeZone?: string): string {
  const { day, month, year, parts } = datePartsText(date, timeZone);
  const zone = parts.timeZoneName ? ` (${parts.timeZoneName})` : "";
  return `${day} ${month} ${year}, ${parts.hour}:${parts.minute}${zone}`;
}

/** One table cell, formatted by the column's declared type. */
export function formatCell(value: unknown, type: ReportColumnType, timeZone?: string): string {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "money":
      return formatMoney(value);
    case "number":
      return formatNumber(value);
    case "date":
      return formatDate(value, timeZone);
    default:
      return formatScalar(value, timeZone);
  }
}

/** A loosely-typed value with no column type to go on (string columns, summary values). */
export function formatScalar(value: unknown, timeZone?: string): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Money) return formatMoney(value);
  if (value instanceof Date) return formatDate(value, timeZone);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "bigint") return formatNumber(value);
  if (typeof value === "string") return value;
  return "";
}

/** "grandTotal" -> "Grand total", "totalNbv" -> "Total NBV". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Money) &&
    !(value instanceof Date) &&
    !Array.isArray(value)
  );
}

function isScalar(value: unknown): boolean {
  return (
    value instanceof Money ||
    value instanceof Date ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  );
}

export interface SummaryLine {
  label: string;
  value: string;
}

/**
 * A report's `totals` as printable "label: value" lines. `totals` is report-specific
 * (`{debit, credit, balanced}`, `{grandTotal, byMethod}`, `{count}`...), so it is rendered
 * generically: scalars become a line each, a one-level nested object (e.g. `byMethod`)
 * becomes "By method — CASH" style lines, arrays are skipped, and any nested entry keyed
 * by an id (a UUID) is skipped — a printed report never shows raw ids.
 */
export function summarizeTotals(totals: Record<string, unknown> | undefined, timeZone?: string): SummaryLine[] {
  if (!totals) return [];
  const lines: SummaryLine[] = [];

  for (const [key, value] of Object.entries(totals)) {
    if (value === null || value === undefined) continue;

    if (isScalar(value)) {
      lines.push({ label: humanizeKey(key), value: formatScalar(value, timeZone) });
      continue;
    }

    if (isPlainObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (UUID.test(nestedKey) || !isScalar(nestedValue)) continue;
        const nestedLabel = /^[A-Z0-9_ -]+$/.test(nestedKey) ? nestedKey : humanizeKey(nestedKey);
        lines.push({ label: `${humanizeKey(key)} — ${nestedLabel}`, value: formatScalar(nestedValue, timeZone) });
      }
    }
  }
  return lines;
}
