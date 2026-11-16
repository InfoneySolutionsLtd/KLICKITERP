import { createHash } from "node:crypto";
import { Money } from "../../../../shared/money/money";
import type { ReportColumnDef } from "../report-registry.service";

/** Stable, order-independent JSON: object keys sorted, `Money` as its decimal string, `Date` as ISO, `undefined` dropped. */
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Money) return value.toDecimalString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .filter((key) => source[key] !== undefined)
        .map((key) => [key, canonicalize(source[key])]),
    );
  }
  return value;
}

/**
 * SHA-256 (hex) over the report's columns, rows and totals — the "data fingerprint"
 * printed in every page footer and stored on the report's verification record.
 *
 * What it proves: the verification record holds the fingerprint of the data as it was
 * generated, and the same value is printed on the PDF. Someone holding a printout can
 * compare the two; a printout whose figures were edited cannot be made to match a
 * fingerprint it does not print, and a fresh fingerprint would not match the record's.
 * Deliberately computed from the DATA, not the rendered bytes, so the same data always
 * yields the same fingerprint regardless of layout or the time it was rendered.
 */
export function computeReportFingerprint(input: {
  columns: ReportColumnDef[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
}): string {
  const canonical = JSON.stringify(canonicalize({ columns: input.columns, rows: input.rows, totals: input.totals ?? null }));
  return createHash("sha256").update(canonical).digest("hex");
}
