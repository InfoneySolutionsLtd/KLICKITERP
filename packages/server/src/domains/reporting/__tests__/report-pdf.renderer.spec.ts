import { Money } from "../../../shared/money/money";
import {
  buildReportDocDefinition,
  detectImageMime,
  renderReportPdf,
  type ReportPdfInput,
} from "../application/pdf/report-pdf.renderer";
import type { ReportColumnDef } from "../application/report-registry.service";

/** A real 1x1 PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');

const NAIROBI = "Africa/Nairobi";
const PAGE = { width: 595, height: 842, orientation: "portrait" as const };

const COLUMNS: ReportColumnDef[] = [
  { key: "date", label: "Date", type: "date" },
  { key: "doc", label: "Document No.", type: "string" },
  { key: "debit", label: "Debit", type: "money" },
  { key: "credit", label: "Credit", type: "money" },
];

function makeInput(overrides: Partial<ReportPdfInput> = {}): ReportPdfInput {
  return {
    title: "Student Statement",
    columns: COLUMNS,
    rows: [
      { date: new Date("2026-07-30T21:00:00.000Z"), doc: "PAY-000059", debit: Money.fromDecimalString("0"), credit: Money.fromDecimalString("1") },
      { date: "2026-08-22", doc: "BIL-000180", debit: Money.fromDecimalString("1234.5"), credit: Money.fromDecimalString("0") },
    ],
    totals: { totalDebit: Money.fromDecimalString("1234.5"), balanced: true },
    paramLines: [{ label: "Student", value: "Eric Mwangi (254)" }],
    branding: { logo: null, headerText: null, footerText: null, watermarkText: null, signatures: [] },
    generatedAt: new Date("2026-11-16T11:32:00.000Z"),
    generatedBy: "John Havy",
    verification: { url: "https://erp.example.com/verify/tok123", reference: "RPT-0194A7C2", fingerprint: "a1b2c3d4e5f60718" + "0".repeat(48) },
    timeZone: NAIROBI,
    ...overrides,
  };
}

type PageFn = (currentPage: number, pageCount: number, pageSize: typeof PAGE) => unknown;
const callHeader = (def: ReturnType<typeof buildReportDocDefinition>) => JSON.stringify((def.header as PageFn)(1, 3, PAGE));
const callFooter = (def: ReturnType<typeof buildReportDocDefinition>, page = 1, pages = 3) =>
  JSON.stringify((def.footer as PageFn)(page, pages, PAGE));
const content = (def: ReturnType<typeof buildReportDocDefinition>) => JSON.stringify(def.content);

describe("detectImageMime", () => {
  it("recognises the two formats pdfmake can embed, and nothing else", () => {
    expect(detectImageMime(PNG)).toBe("image/png");
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(detectImageMime(SVG)).toBeNull();
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
  });
});

describe("buildReportDocDefinition", () => {
  describe("header", () => {
    it("shows the logo and the branding header text on every page", () => {
      const def = buildReportDocDefinition(
        makeInput({ branding: { logo: { buffer: PNG }, headerText: "KLICKIT ACADEMY — P.O. Box 1, Nairobi", footerText: null, watermarkText: null, signatures: [] } }),
      );
      const header = callHeader(def);
      expect(header).toContain("KLICKIT ACADEMY — P.O. Box 1, Nairobi");
      expect(header).toContain("data:image/png;base64,");
      expect(header).toContain("Student Statement");
    });

    // The header is `{ stack: [ { stack: [logo?, headerText?, title?, rule] }, absolute title? ] }`.
    type Node = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const headerRoot = (def: ReturnType<typeof buildReportDocDefinition>) => (def.header as PageFn)(1, 3, PAGE) as Node;
    const letterhead = (def: ReturnType<typeof buildReportDocDefinition>) => headerRoot(def).stack[0].stack as Node[];
    const brandingWith = (overrides: Partial<ReportPdfInput["branding"]>): ReportPdfInput["branding"] => ({
      logo: null, headerText: null, footerText: null, watermarkText: null, signatures: [], ...overrides,
    });

    it("centres the logo on top, with the header text centred directly beneath it", () => {
      const def = buildReportDocDefinition(makeInput({ branding: brandingWith({ logo: { buffer: PNG }, headerText: "Infoney Solutions Academy" }) }));
      const [logo, text] = letterhead(def);

      expect(logo.image).toContain("data:image/png;base64,");
      expect(logo.alignment).toBe("center");
      expect(text).toMatchObject({ text: "Infoney Solutions Academy", alignment: "center", bold: true });
    });

    it("keeps the report title small in the top-right corner when there is a logo — positioned absolutely so it can't disturb the centring", () => {
      const def = buildReportDocDefinition(makeInput({ branding: brandingWith({ logo: { buffer: PNG }, headerText: "Academy" }) }));
      const title = headerRoot(def).stack[1];

      expect(title.absolutePosition).toEqual({ x: PAGE.width - 36 - 160, y: 20 });
      expect(title.columns[0]).toMatchObject({ text: "Student Statement", alignment: "right" });
      // …and the title is NOT part of the centred stack
      expect(JSON.stringify(letterhead(def))).not.toContain("Student Statement");
    });

    it("with no logo for the title to sit beside, shows it as a small centred line under the header text instead", () => {
      const def = buildReportDocDefinition(makeInput({ branding: brandingWith({ headerText: "Academy" }) }));
      const nodes = letterhead(def);

      expect(nodes[0]).toMatchObject({ text: "Academy", alignment: "center" });
      expect(nodes[1]).toMatchObject({ text: "Student Statement", alignment: "center" });
      expect(headerRoot(def).stack).toHaveLength(1); // no absolutely-positioned title
    });

    it("sizes the top margin to the letterhead, so a long wrapped header text can't run into the table", () => {
      const topMargin = (branding: ReportPdfInput["branding"]) => (buildReportDocDefinition(makeInput({ branding })).pageMargins as number[])[1];

      const shortText = topMargin(brandingWith({ logo: { buffer: PNG }, headerText: "Academy" }));
      const longText = topMargin(brandingWith({ logo: { buffer: PNG }, headerText: "A very long letterhead line ".repeat(8).slice(0, 200) }));
      const noLogo = topMargin(brandingWith({ headerText: "Academy" }));
      const nothing = topMargin(brandingWith({}));

      expect(longText).toBeGreaterThan(shortText + 20); // 200 chars wrap onto ~3 lines
      expect(shortText).toBeGreaterThan(noLogo); // the logo needs room too
      expect(nothing).toBeGreaterThanOrEqual(56); // never collapses
    });

    it("degrades to a text-only letterhead when there is no logo, or the logo is a format that can't be embedded (SVG)", () => {
      const none = callHeader(buildReportDocDefinition(makeInput()));
      expect(none).not.toContain("data:image");

      const svg = callHeader(
        buildReportDocDefinition(makeInput({ branding: { logo: { buffer: SVG }, headerText: "X", footerText: null, watermarkText: null, signatures: [] } })),
      );
      expect(svg).not.toContain("data:image");
    });
  });

  describe("footer", () => {
    const branding = { logo: null, headerText: null, footerText: "Thank you for choosing Klickit", watermarkText: null, signatures: [] };

    it("prints the footer text, the local generation stamp and who generated it", () => {
      const footer = callFooter(buildReportDocDefinition(makeInput({ branding })));
      expect(footer).toContain("Thank you for choosing Klickit");
      expect(footer).toContain("Generated 16 Nov 2026, 14:32 (GMT+3) by John Havy");
    });

    it("omits 'by …' when the generator is unknown", () => {
      const footer = callFooter(buildReportDocDefinition(makeInput({ generatedBy: null })));
      expect(footer).toContain("Generated 16 Nov 2026, 14:32 (GMT+3)");
      expect(footer).not.toContain(" by ");
    });

    it("carries the verification QR, the reference and the first 16 chars of the fingerprint — on every page", () => {
      const def = buildReportDocDefinition(makeInput());
      for (const page of [1, 2, 3]) {
        const footer = callFooter(def, page, 3);
        expect(footer).toContain('"qr":"https://erp.example.com/verify/tok123"');
        expect(footer).toContain("RPT-0194A7C2");
        expect(footer).toContain("a1b2c3d4e5f60718");
        expect(footer).toContain(`Page ${page} of 3`);
      }
    });
  });

  describe("watermark", () => {
    it("uses the branding watermark text", () => {
      const def = buildReportDocDefinition(
        makeInput({ branding: { logo: null, headerText: null, footerText: null, watermarkText: "CONFIDENTIAL", signatures: [] } }),
      );
      expect(def.watermark).toMatchObject({ text: "CONFIDENTIAL" });
    });

    it("has no watermark when none is configured", () => {
      expect(buildReportDocDefinition(makeInput()).watermark).toBeUndefined();
    });
  });

  describe("body", () => {
    it("prints the title, the readable parameters and the record count", () => {
      const body = content(buildReportDocDefinition(makeInput()));
      expect(body).toContain("Student Statement");
      expect(body).toContain("Student:");
      expect(body).toContain("Eric Mwangi (254)");
      expect(body).toContain("2 records");
    });

    it("formats cells for reading: grouped 2-dp money, local dates, right-aligned numbers", () => {
      const body = content(buildReportDocDefinition(makeInput()));
      expect(body).toContain("1,234.50");
      expect(body).toContain("31 Jul 2026"); // 21:00Z instant -> next day in Nairobi
      expect(body).toContain("22 Aug 2026");
      expect(body).not.toContain("1234.5000");
      expect(body).not.toContain("T21:00:00");
      // header cells for money columns are right-aligned
      expect(body).toContain('"text":"Debit","style":"th","alignment":"right"');
      expect(body).toContain('"text":"Document No.","style":"th","alignment":"left"');
    });

    it("repeats the header row on each page and keeps rows whole", () => {
      const def = buildReportDocDefinition(makeInput());
      const table = (def.content as { table?: { headerRows: number; dontBreakRows: boolean; widths: unknown[] } }[]).find((node) => node.table?.headerRows)!.table!;
      expect(table.headerRows).toBe(1);
      expect(table.dontBreakRows).toBe(true);
      expect(table.widths).toContain("*"); // a flexible column always exists
    });

    it("keeps one flexible column even when every column is numeric", () => {
      const numeric: ReportColumnDef[] = [
        { key: "a", label: "A", type: "money" },
        { key: "b", label: "B", type: "number" },
      ];
      const def = buildReportDocDefinition(makeInput({ columns: numeric, rows: [{ a: "1", b: "2" }] }));
      const table = (def.content as { table?: { headerRows: number; widths: unknown[] } }[]).find((node) => node.table?.headerRows)!.table!;
      expect(table.widths).toEqual(["*", "auto"]);
    });

    it("shows an empty-state line instead of a bare table when there are no rows", () => {
      const body = content(buildReportDocDefinition(makeInput({ rows: [] })));
      expect(body).toContain("No records match these parameters.");
      expect(body).toContain("0 records");
    });

    it("lists the report's totals under a Summary heading", () => {
      const body = content(buildReportDocDefinition(makeInput()));
      expect(body).toContain("Summary");
      expect(body).toContain("Total debit");
      expect(body).toContain("Balanced");
    });

    it("omits the Summary when there are no totals", () => {
      expect(content(buildReportDocDefinition(makeInput({ totals: undefined })))).not.toContain("Summary");
    });
  });

  describe("page setup", () => {
    it("stays portrait when the table fits — even the 7-column student statement — and goes landscape only when it would not", () => {
      const statement: ReportColumnDef[] = [
        { key: "date", label: "Date", type: "date" },
        { key: "documentType", label: "Document Type", type: "string" },
        { key: "documentNo", label: "Document No.", type: "string" },
        { key: "memo", label: "Memo", type: "string" },
        { key: "debit", label: "Debit", type: "money" },
        { key: "credit", label: "Credit", type: "money" },
        { key: "balance", label: "Balance", type: "money" },
      ];
      const statementRows = [
        { date: "2026-07-31", documentType: "PAY_RECEIPT", documentNo: "PAY-000059", memo: "Receipt posted", debit: "0", credit: "1234567.5", balance: "-1234567.5" },
      ];
      expect(buildReportDocDefinition(makeInput({ columns: statement, rows: statementRows })).pageOrientation).toBe("portrait");

      const wide: ReportColumnDef[] = [
        { key: "tag", label: "Asset Tag", type: "string" },
        { key: "name", label: "Description", type: "string" },
        { key: "cat", label: "Category", type: "string" },
        { key: "acq", label: "Acquired", type: "date" },
        { key: "cost", label: "Cost", type: "money" },
        { key: "dep", label: "Accum. Depreciation", type: "money" },
        { key: "nbv", label: "Net Book Value", type: "money" },
        { key: "qty", label: "Quantity", type: "number" },
        { key: "status", label: "Status", type: "string" },
      ];
      const wideRows = [{ tag: "FA-0001", name: "School bus (47 seater)", cat: "Vehicles", acq: "2024-05-12", cost: "4500000", dep: "1125000.5", nbv: "3374999.5", qty: 1, status: "ACTIVE" }];
      expect(buildReportDocDefinition(makeInput({ columns: wide, rows: wideRows })).pageOrientation).toBe("landscape");
    });

    it("a single very long text value wraps instead of forcing landscape", () => {
      const columns: ReportColumnDef[] = [
        { key: "note", label: "Note", type: "string" },
        { key: "amount", label: "Amount", type: "money" },
      ];
      const rows = [{ note: "x".repeat(400), amount: "10" }];
      expect(buildReportDocDefinition(makeInput({ columns, rows })).pageOrientation).toBe("portrait");
    });

    it("is A4", () => {
      expect(buildReportDocDefinition(makeInput()).pageSize).toBe("A4");
    });

    it("embeds the reference and generation time as document metadata", () => {
      const def = buildReportDocDefinition(makeInput());
      expect(def.info).toMatchObject({ title: "Student Statement", keywords: "RPT-0194A7C2" });
      expect(def.info?.creationDate).toEqual(new Date("2026-11-16T11:32:00.000Z"));
    });
  });

  describe("signatures", () => {
    it("lays out each embeddable signature image over a line, skipping unusable ones", () => {
      const def = buildReportDocDefinition(
        makeInput({ branding: { logo: null, headerText: null, footerText: null, watermarkText: null, signatures: [{ buffer: PNG }, { buffer: SVG }, { buffer: PNG }] } }),
      );
      const body = content(def);
      expect(body.match(/data:image\/png;base64,/g)).toHaveLength(2);
    });

    it("adds no signature block when there are none", () => {
      expect(content(buildReportDocDefinition(makeInput()))).not.toContain("data:image");
    });
  });
});

describe("renderReportPdf (real rendering)", () => {
  const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  /** Counts page objects (`/Type /Page`, but not `/Type /Pages`). */
  const pageCount = (buffer: Buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

  it("renders a fully branded report to a valid PDF", async () => {
    const pdf = await renderReportPdf(
      makeInput({
        branding: {
          logo: { buffer: PNG },
          headerText: "KLICKIT ACADEMY",
          footerText: "Thank you",
          watermarkText: "KLICKIT ACADEMY",
          signatures: [{ buffer: PNG }],
        },
      }),
    );
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(2000);
    expect(pageCount(pdf)).toBe(1);
  });

  it("renders with no branding at all (a school that has configured nothing yet)", async () => {
    expect(isPdf(await renderReportPdf(makeInput()))).toBe(true);
  });

  it("renders an empty report", async () => {
    expect(isPdf(await renderReportPdf(makeInput({ rows: [], totals: undefined })))).toBe(true);
  });

  it("paginates a long report onto several pages", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({
      date: "2026-08-22",
      doc: `BIL-${String(i).padStart(6, "0")}`,
      debit: Money.fromDecimalString(String(i * 10)),
      credit: Money.fromDecimalString("0"),
    }));
    const pdf = await renderReportPdf(makeInput({ rows }));
    expect(isPdf(pdf)).toBe(true);
    expect(pageCount(pdf)).toBeGreaterThan(3);
  });

  it("renders a wide (landscape) report", async () => {
    const columns: ReportColumnDef[] = Array.from({ length: 10 }, (_, i) => ({
      key: `c${i}`,
      label: `Account column heading ${i}`,
      type: i % 2 ? ("money" as const) : ("string" as const),
    }));
    const row = Object.fromEntries(columns.map((c) => [c.key, c.type === "money" ? "123456789.5" : "some descriptive text"]));
    const input = makeInput({ columns, rows: [row, row] });
    expect(buildReportDocDefinition(input).pageOrientation).toBe("landscape");
    expect(isPdf(await renderReportPdf(input))).toBe(true);
  });
});
