import { formatAmount } from "../format-amount";

describe("formatAmount", () => {
  it.each([
    ["21500.0000", "21,500"],
    ["5000", "5,000"],
    ["0.0000", "0"],
    ["999.9999", "999.99"],
    ["1234.5000", "1,234.50"],
    ["1234567.8900", "1,234,567.89"],
    ["12.3", "12.30"],
    ["-1500.2500", "-1,500.25"],
    ["8.0000", "8"],
  ])("%s -> %s", (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });

  it("never rounds up (truncates the digits it drops) and never goes through a float", () => {
    expect(formatAmount("0.9999")).toBe("0.99");
    expect(formatAmount("9007199254740993.0000")).toBe("9,007,199,254,740,993"); // beyond a float's exact range
  });
});
