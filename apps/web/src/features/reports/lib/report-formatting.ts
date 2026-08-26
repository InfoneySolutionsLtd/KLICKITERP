import { formatMoney } from "@/lib/money";

export type ReportColumnType = "string" | "number" | "money" | "date";

/** Formats one report result cell for display, given its column's declared `type` (from `ReportColumnResponseDto`). */
export function formatReportCellValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return "—";
  if (type === "money") return typeof value === "string" ? formatMoney(value) : String(value);
  if (type === "date") return typeof value === "string" ? new Date(value).toLocaleDateString() : String(value);
  return String(value);
}

/** `key`-based fallback label for a `totals` entry that doesn't match any known column (e.g. Trial Balance's `balanced`). */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Same as `formatReportCellValue`, plus a boolean case (`totals` can carry booleans, e.g. Trial Balance's `balanced`, that no column ever does). */
export function formatTotalValue(value: unknown, type: string | undefined, yesLabel: string, noLabel: string): string {
  if (typeof value === "boolean") return value ? yesLabel : noLabel;
  return formatReportCellValue(value, type ?? "string");
}
