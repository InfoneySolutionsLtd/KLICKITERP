/**
 * Formats a decimal string (`"21500.0000"`) the way a notification says it: thousands separated, and cents only when there
 * are some (`"21,500"`, `"1,234.50"`). Works on the string, never on a float, so no amount is rounded on its way to a sentence.
 */
export function formatAmount(decimal: string): string {
  const negative = decimal.startsWith("-");
  const [whole = "0", fraction = ""] = decimal.replace(/^-/, "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = fraction.slice(0, 2).padEnd(2, "0");
  return `${negative ? "-" : ""}${grouped}${cents === "00" ? "" : `.${cents}`}`;
}
