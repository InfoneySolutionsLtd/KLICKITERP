/**
 * Decimal-string money -> long-form English words, e.g. `"9000.0000"` ->
 * `"Nine Thousand Kenya Shillings Only"`. Purely for the invoice print
 * view's "Balance is ... Only" line (matches the reference screenshot) — a
 * cosmetic addition, no bookkeeping value depends on this.
 *
 * Follows `lib/money.ts`'s own discipline: never `parseFloat`/`Number()` on
 * the decimal string — the whole/fractional parts are extracted by plain
 * string splitting and converted digit-group by digit-group using only
 * integer arithmetic (`Number()` is used only on already-isolated 1-3 digit
 * chunks, e.g. "042" -> 42, never on the full amount).
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

const CURRENCY_NAMES: Record<string, { major: string; minor: string }> = {
  KES: { major: "Kenya Shillings", minor: "Cents" },
};

function threeDigitGroupToWords(group: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(group / 100);
  const remainder = group % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(ones > 0 ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens]);
    }
  }
  return parts.join(" ");
}

/** `digits` is a plain non-negative integer string (no sign, no leading `+`) — converts it to long-form words. `"0"` -> `"Zero"`. */
function integerStringToWords(digits: string): string {
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  if (trimmed === "0") return "Zero";

  const groups: number[] = [];
  let remaining = trimmed;
  while (remaining.length > 0) {
    const chunk = remaining.slice(-3);
    groups.unshift(Number(chunk));
    remaining = remaining.slice(0, -3);
  }
  if (groups.length > SCALES.length) {
    // Beyond this app's realistic amount range (trillions) — fall back to the raw digit string rather than silently mis-rendering.
    return trimmed;
  }

  const words: string[] = [];
  const scaleOffset = groups.length - 1;
  groups.forEach((group, index) => {
    if (group === 0) return;
    const scale = SCALES[scaleOffset - index];
    words.push(scale ? `${threeDigitGroupToWords(group)} ${scale}` : threeDigitGroupToWords(group));
  });
  return words.join(" ");
}

/**
 * `decimalString` is a `Money.toDecimalString()`-shaped value (any scale,
 * e.g. `"9000.0000"`, `"-150.50"`). Negative amounts are rendered as
 * "Negative ..." — a negative balance (credit) can legitimately reach this
 * line. Cents are only mentioned when genuinely non-zero.
 */
export function amountInWords(decimalString: string, currency = "KES"): string {
  const names = CURRENCY_NAMES[currency] ?? { major: currency, minor: "Cents" };
  const trimmed = decimalString.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholeRaw, fracRaw = ""] = unsigned.split(".");
  const whole = wholeRaw || "0";
  // First 2 fractional digits ARE the cents (decimal money, base 10) —
  // truncated, never rounded, past that: a "Balance in words" cosmetic line
  // has no need for sub-cent precision either way.
  const cents = Number(fracRaw.padEnd(2, "0").slice(0, 2));

  const wholeWords = integerStringToWords(whole);
  const centsWords = cents > 0 ? ` and ${integerStringToWords(String(cents))} ${names.minor}` : "";
  const sign = negative ? "Negative " : "";

  return `${sign}${wholeWords} ${names.major}${centsWords} Only`;
}
