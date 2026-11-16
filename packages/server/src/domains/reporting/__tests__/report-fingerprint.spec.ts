import { Money } from "../../../shared/money/money";
import { computeReportFingerprint } from "../application/pdf/report-fingerprint";
import type { ReportColumnDef } from "../application/report-registry.service";

const COLUMNS: ReportColumnDef[] = [
  { key: "doc", label: "Document", type: "string" },
  { key: "amount", label: "Amount", type: "money" },
];

describe("computeReportFingerprint", () => {
  const base = {
    columns: COLUMNS,
    rows: [{ doc: "PAY-000059", amount: Money.fromDecimalString("1") }],
    totals: { total: Money.fromDecimalString("1") },
  };

  it("is a 64-char lowercase hex SHA-256", () => {
    expect(computeReportFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and independent of object key order", () => {
    const reordered = {
      totals: { total: Money.fromDecimalString("1") },
      rows: [{ amount: Money.fromDecimalString("1"), doc: "PAY-000059" }],
      columns: COLUMNS,
    };
    expect(computeReportFingerprint(reordered)).toBe(computeReportFingerprint(base));
  });

  it("changes when any figure changes — the point of printing it", () => {
    const edited = { ...base, rows: [{ doc: "PAY-000059", amount: Money.fromDecimalString("10") }] };
    expect(computeReportFingerprint(edited)).not.toBe(computeReportFingerprint(base));
  });

  it("changes when a row is added or the row order changes", () => {
    const extra = { ...base, rows: [...base.rows, { doc: "PAY-000060", amount: Money.fromDecimalString("1") }] };
    expect(computeReportFingerprint(extra)).not.toBe(computeReportFingerprint(base));

    const two = { ...base, rows: [{ doc: "A", amount: "1" }, { doc: "B", amount: "2" }] };
    const swapped = { ...base, rows: [{ doc: "B", amount: "2" }, { doc: "A", amount: "1" }] };
    expect(computeReportFingerprint(two)).not.toBe(computeReportFingerprint(swapped));
  });

  it("treats a Money and its decimal string alike, and serialises dates as ISO", () => {
    const asString = { ...base, rows: [{ doc: "PAY-000059", amount: "1.0000" }], totals: { total: "1.0000" } };
    expect(computeReportFingerprint(asString)).toBe(computeReportFingerprint(base));

    const withDate = { ...base, rows: [{ doc: "x", amount: new Date("2026-07-30T21:00:00.000Z") }] };
    const withIso = { ...base, rows: [{ doc: "x", amount: "2026-07-30T21:00:00.000Z" }] };
    expect(computeReportFingerprint(withDate)).toBe(computeReportFingerprint(withIso));
  });

  it("treats absent totals the same as null totals", () => {
    expect(computeReportFingerprint({ columns: COLUMNS, rows: [] })).toBe(
      computeReportFingerprint({ columns: COLUMNS, rows: [], totals: undefined }),
    );
  });
});
