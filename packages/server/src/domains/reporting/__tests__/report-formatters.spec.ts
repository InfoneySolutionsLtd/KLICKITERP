import { Money } from "../../../shared/money/money";
import {
  formatCell,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatScalar,
  humanizeKey,
  summarizeTotals,
} from "../application/pdf/report-formatters";

const NAIROBI = "Africa/Nairobi";

describe("formatMoney", () => {
  it("groups thousands and shows exactly 2 decimals", () => {
    expect(formatMoney("1234.5000")).toBe("1,234.50");
    expect(formatMoney("1234567890.9999")).toBe("1,234,567,891.00");
    expect(formatMoney("500")).toBe("500.00");
  });

  it("rounds half-up on the decimal string, never through a float", () => {
    expect(formatMoney("0.125")).toBe("0.13");
    expect(formatMoney("0.0050")).toBe("0.01");
    expect(formatMoney("0.0049")).toBe("0.00");
    expect(formatMoney("2.675")).toBe("2.68"); // a float would give 2.67
  });

  it("keeps the sign, but never prints a negative zero", () => {
    expect(formatMoney("-1.0000")).toBe("-1.00");
    expect(formatMoney("-0.0040")).toBe("0.00");
  });

  it("accepts a Money, a number and a bigint", () => {
    expect(formatMoney(Money.fromDecimalString("498.0000"))).toBe("498.00");
    expect(formatMoney(1234.5)).toBe("1,234.50");
    expect(formatMoney(7n)).toBe("7.00");
  });

  it("returns empty for null/undefined/'' and the raw text for non-numeric input rather than throwing", () => {
    expect(formatMoney(null)).toBe("");
    expect(formatMoney(undefined)).toBe("");
    expect(formatMoney("")).toBe("");
    expect(formatMoney("n/a")).toBe("n/a");
  });
});

describe("formatNumber", () => {
  it("groups thousands and trims trailing decimal zeros", () => {
    expect(formatNumber("1000")).toBe("1,000");
    expect(formatNumber("12.5000")).toBe("12.5");
    expect(formatNumber("0.0000")).toBe("0");
    expect(formatNumber(7)).toBe("7");
  });

  it("keeps the sign, not for zero", () => {
    expect(formatNumber("-0.5")).toBe("-0.5");
    expect(formatNumber("-0.0000")).toBe("0");
  });
});

describe("formatDate", () => {
  it("shows a bare calendar date as-is, with no timezone shift", () => {
    expect(formatDate("2026-07-31", NAIROBI)).toBe("31 Jul 2026");
    expect(formatDate("2026-07-31", "UTC")).toBe("31 Jul 2026");
    expect(formatDate("2026-09-05", NAIROBI)).toBe("5 Sep 2026");
  });

  it("converts an instant into the local zone — midnight Nairobi stored as 21:00Z the day before prints as the right local date", () => {
    // The real-world case from a student statement CSV: `2026-07-30T21:00:00.000Z` is 31 Jul in Nairobi.
    const instant = new Date("2026-07-30T21:00:00.000Z");
    expect(formatDate(instant, NAIROBI)).toBe("31 Jul 2026");
    expect(formatDate(instant, "UTC")).toBe("30 Jul 2026");
    expect(formatDate("2026-07-30T21:00:00.000Z", NAIROBI)).toBe("31 Jul 2026");
  });

  it("returns empty for empty input and the raw text for an unparseable date", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("not a date")).toBe("not a date");
  });
});

describe("formatDateTime", () => {
  it("prints the generation stamp in the local zone with the zone named", () => {
    expect(formatDateTime(new Date("2026-11-16T11:32:00.000Z"), NAIROBI)).toBe("16 Nov 2026, 14:32 (GMT+3)");
  });

  it("shows midnight as 00:xx, not 24:xx", () => {
    expect(formatDateTime(new Date("2026-11-16T21:05:00.000Z"), NAIROBI)).toBe("17 Nov 2026, 00:05 (GMT+3)");
  });
});

describe("formatCell / formatScalar", () => {
  it("formats by the column's declared type", () => {
    expect(formatCell("1500.0000", "money", NAIROBI)).toBe("1,500.00");
    expect(formatCell("1500.0000", "number", NAIROBI)).toBe("1,500");
    expect(formatCell("2026-07-31", "date", NAIROBI)).toBe("31 Jul 2026");
    expect(formatCell("Tuition", "string", NAIROBI)).toBe("Tuition");
    expect(formatCell(null, "money", NAIROBI)).toBe("");
  });

  it("formats loosely-typed values sensibly in a string column", () => {
    expect(formatScalar(true)).toBe("Yes");
    expect(formatScalar(false)).toBe("No");
    expect(formatScalar(Money.fromDecimalString("3.5"))).toBe("3.50");
    expect(formatScalar(42)).toBe("42");
  });
});

describe("humanizeKey", () => {
  it("turns camelCase / snake_case keys into sentence case, keeping acronyms upper-case", () => {
    expect(humanizeKey("grandTotal")).toBe("Grand total");
    expect(humanizeKey("closing_balance")).toBe("Closing balance");
    expect(humanizeKey("totalNbv")).toBe("Total NBV");
    expect(humanizeKey("count")).toBe("Count");
  });
});

describe("summarizeTotals", () => {
  it("renders scalars, expands one nested level, and never prints a raw id", () => {
    const lines = summarizeTotals(
      {
        debit: Money.fromDecimalString("1500"),
        credit: Money.fromDecimalString("1500"),
        balanced: true,
        count: 3,
        byMethod: { CASH: Money.fromDecimalString("1000"), mpesaTotal: Money.fromDecimalString("500") },
        byAccount: { "0190b2c4-1111-7222-8333-444455556666": Money.fromDecimalString("99") },
        ignoredList: [1, 2],
        missing: null,
      },
      NAIROBI,
    );

    expect(lines).toEqual([
      { label: "Debit", value: "1,500.00" },
      { label: "Credit", value: "1,500.00" },
      { label: "Balanced", value: "Yes" },
      { label: "Count", value: "3" },
      { label: "By method — CASH", value: "1,000.00" },
      { label: "By method — Mpesa total", value: "500.00" },
    ]);
  });

  it("returns nothing when there are no totals", () => {
    expect(summarizeTotals(undefined)).toEqual([]);
    expect(summarizeTotals({})).toEqual([]);
  });
});
