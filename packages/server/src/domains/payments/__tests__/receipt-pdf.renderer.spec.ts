import {
  buildReceiptDocDefinition,
  formatKes,
  formatReceiptDate,
  imageDataUrl,
  renderReceiptPdf,
  type ReceiptPdfData,
  type ReceiptPdfInput,
} from "../application/receipt-pdf/receipt-pdf.renderer";
import { describeReceiptAllocation, describeReceiptMethod } from "../application/receipt-pdf/receipt-labels";

// A 1x1 PNG, so a "logo" is a real image pdfmake can embed.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const receipt = (over: Partial<ReceiptPdfData> = {}): ReceiptPdfData => ({
  number: "RCP-000042",
  date: "2026-03-10",
  status: "POSTED",
  amount: "2500.0000",
  payerName: "Wanjiru Kamau",
  learnerName: "Amina Wanjiru Kamau",
  admissionNo: "ADM-1001",
  className: "Grade 4",
  methods: [{ label: "M-Pesa", amount: "2500.0000", reference: "QWE123XYZ9" }],
  appliedTo: [{ label: "Invoice INV-000101", amount: "2500.0000" }],
  account: { invoices: [], moreInvoices: 0, totalBalance: "0.0000" },
  ...over,
});

const input = (over: Partial<ReceiptPdfInput> = {}): ReceiptPdfInput => ({
  receipt: receipt(),
  branding: { logo: PNG, headerText: "Sunrise Academy", footerText: "Thank you for your payment." },
  verification: { url: "https://erp.school.example/verify/abc123", reference: "RCP-000042" },
  generatedAt: new Date("2026-03-10T09:30:00Z"),
  timeZone: "Africa/Nairobi",
  ...over,
});

/** Every string in the document definition, so a test can ask "does the receipt say this?" */
const texts = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => texts(v, out));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((v) => texts(v, out));
  return out;
};
const printed = (over: Partial<ReceiptPdfInput> = {}) => texts(buildReceiptDocDefinition(input(over)).content).join("\n");

describe("formatKes — exact, from the decimal string (no floating point)", () => {
  it.each([
    ["2500.0000", "KES 2,500.00"],
    ["2500.5000", "KES 2,500.50"],
    ["0.0000", "KES 0.00"],
    ["1234567.8900", "KES 1,234,567.89"],
    ["999.9999", "KES 999.9999"],
    ["2500.1250", "KES 2,500.125"],
    ["7", "KES 7.00"],
    ["-150.0000", "-KES 150.00"],
  ])("%s -> %s", (input_, expected) => {
    expect(formatKes(input_)).toBe(expected);
  });

  it("does not print NaN for garbage", () => {
    expect(formatKes("abc")).toBe("KES abc");
  });
});

describe("formatReceiptDate", () => {
  it("a calendar date, with no time zone shifting it", () => {
    expect(formatReceiptDate("2026-03-10")).toBe("10 March 2026");
    expect(formatReceiptDate("2026-12-01")).toBe("1 December 2026");
    expect(formatReceiptDate("not a date")).toBe("not a date");
  });
});

describe("imageDataUrl", () => {
  it("embeds PNG and JPEG, and skips anything pdfmake cannot embed rather than crashing", () => {
    expect(imageDataUrl(PNG)).toMatch(/^data:image\/png;base64,/);
    expect(imageDataUrl(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageDataUrl(Buffer.from("<svg></svg>"))).toBeNull();
  });
});

describe("what the receipt says", () => {
  it("prints the receipt as the books hold it", () => {
    const text = printed();
    expect(text).toContain("Sunrise Academy");
    expect(text).toContain("PAYMENT RECEIPT");
    expect(text).toContain("Receipt RCP-000042");
    expect(text).toContain("10 March 2026");
    expect(text).toContain("Wanjiru Kamau");
    expect(text).toContain("Amina Wanjiru Kamau (Grade 4)");
    expect(text).toContain("ADM-1001");
    expect(text).toContain("M-Pesa  -  ref. QWE123XYZ9");
    expect(text).toContain("KES 2,500.00");
    expect(text).toContain("Invoice INV-000101");
  });

  it("shows each part of a split payment with its own amount", () => {
    const text = printed({
      receipt: receipt({
        amount: "3000.0000",
        methods: [
          { label: "Cash", amount: "1000.0000", reference: null },
          { label: "M-Pesa", amount: "2000.0000", reference: "ABC999" },
        ],
      }),
    });
    expect(text).toContain("Paid by (split)");
    expect(text).toContain("Cash   KES 1,000.00");
    expect(text).toContain("M-Pesa  -  ref. ABC999   KES 2,000.00");
  });

  it("says where the money went, including advance payment", () => {
    const text = printed({ receipt: receipt({ appliedTo: [{ label: "Invoice INV-000101", amount: "2000.0000" }, { label: "Advance payment (credit on the account)", amount: "500.0000" }] }) });
    expect(text).toContain("Invoice INV-000101");
    expect(text).toContain("Advance payment (credit on the account)");
  });

  it("leaves out the 'applied to' table when there is nothing to say", () => {
    expect(printed({ receipt: receipt({ appliedTo: [] }) })).not.toContain("Applied to");
  });

  it("never prints a phone number, a cashier or an internal id", () => {
    const text = printed();
    expect(text).not.toMatch(/254\d{9}|0[17]\d{8}|cashier|uuid/i);
  });
});

describe("a reversed receipt", () => {
  it("says so plainly, in the text and as a watermark", () => {
    const definition = buildReceiptDocDefinition(input({ receipt: receipt({ status: "REVERSED" }) }));
    expect(texts(definition.content).join("\n")).toMatch(/HAS BEEN REVERSED/);
    expect((definition as { watermark?: { text: string } }).watermark?.text).toBe("REVERSED");
  });

  it("a valid receipt has neither", () => {
    const definition = buildReceiptDocDefinition(input());
    expect(texts(definition.content).join("\n")).not.toMatch(/REVERSED/);
    expect((definition as { watermark?: unknown }).watermark).toBeUndefined();
  });
});

describe("verification and branding degrade gracefully", () => {
  it("prints the QR code and the verify address when the receipt has a verification token", () => {
    const body = JSON.stringify(buildReceiptDocDefinition(input()).content);
    expect(body).toContain('"qr":"https://erp.school.example/verify/abc123"');
    expect(body).toContain("Verify this receipt");
  });

  it("puts the QR code in the HEADER, so it is on the first page of every receipt however long the account below it runs", () => {
    const content = buildReceiptDocDefinition(input()).content as unknown[];
    expect(JSON.stringify(content[0])).toContain('"qr":"https://erp.school.example/verify/abc123"');
    expect(JSON.stringify(content[0])).toContain("Scan to verify");
    // exactly one QR code in the whole document, and none after the header
    expect(JSON.stringify(content.slice(1))).not.toContain('"qr"');
    expect((JSON.stringify(content).match(/"qr"/g) ?? []).length).toBe(1);
  });

  it("still explains how to verify, with the address and the reference, at the end", () => {
    const text = printed();
    expect(text).toContain("Scan the code at the top of this receipt");
    expect(text).toContain("https://erp.school.example/verify/abc123");
    expect(text).toContain("Reference RCP-000042");
  });

  it("omits the QR code (rather than faking one) for a receipt with no token", () => {
    const body = JSON.stringify(buildReceiptDocDefinition(input({ verification: null })).content);
    expect(body).not.toContain('"qr"');
    expect(body).not.toContain("Verify this receipt");
  });

  it("an unbranded school still gets a receipt", () => {
    const definition = buildReceiptDocDefinition(input({ branding: { logo: null, headerText: null, footerText: null } }));
    const text = texts(definition.content).join("\n");
    expect(text).toContain("PAYMENT RECEIPT");
    expect(JSON.stringify(definition.content)).not.toContain('"image"');
  });

  it("a logo that is not PNG/JPEG is skipped, not fatal", () => {
    const definition = buildReceiptDocDefinition(input({ branding: { logo: Buffer.from("<svg/>"), headerText: "Sunrise Academy", footerText: null } }));
    expect(JSON.stringify(definition.content)).not.toContain('"image"');
    expect(texts(definition.content).join("\n")).toContain("Sunrise Academy");
  });
});

describe("renderReceiptPdf — real PDF bytes", () => {
  it("renders a complete branded receipt", async () => {
    const buffer = await renderReceiptPdf(input());
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.subarray(-6).toString()).toMatch(/%%EOF/);
    expect(buffer.length).toBeGreaterThan(1500);
  });

  it("renders a reversed, unbranded, QR-less receipt too", async () => {
    const buffer = await renderReceiptPdf(input({ receipt: receipt({ status: "REVERSED" }), branding: { logo: null, headerText: null, footerText: null }, verification: null }));
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("survives an unusually long name and many allocations (it must still fit on pages, not throw)", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ label: `Invoice INV-${String(i).padStart(6, "0")}`, amount: "10.0000" }));
    const buffer = await renderReceiptPdf(input({ receipt: receipt({ payerName: "A".repeat(120), learnerName: "B".repeat(150), appliedTo: many }) }));
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("receipt wording (shared by the PDF and the portal's list)", () => {
  it.each([
    ["CASH", null, "Cash", null],
    ["MPESA_STK", "QWE123", "M-Pesa", "QWE123"],
    ["MPESA_C2B", " QWE124 ", "M-Pesa", "QWE124"],
    ["BANK_TRANSFER", "REF-9", "Bank transfer", "REF-9"],
    ["WALLET", null, "School wallet", null],
    ["CREDIT_BALANCE", null, "Credit on the account", null],
    ["SOMETHING_NEW", null, "SOMETHING_NEW", null],
  ])("%s", (method, ref, label, reference) => {
    expect(describeReceiptMethod(method, ref)).toEqual({ label, reference });
  });

  it("never shows a reference for cheque or card (those details are not for the list)", () => {
    expect(describeReceiptMethod("CHEQUE", "CHQ-001").reference).toBeNull();
    expect(describeReceiptMethod("CARD", "4111").reference).toBeNull();
    expect(describeReceiptMethod("POS", "TERM-7").reference).toBeNull();
  });

  it("allocations", () => {
    expect(describeReceiptAllocation({ toPrepayment: false, invoiceNumber: "INV-000101" })).toBe("Invoice INV-000101");
    expect(describeReceiptAllocation({ toPrepayment: true, invoiceNumber: null })).toBe("Advance payment (credit on the account)");
    expect(describeReceiptAllocation({ toPrepayment: false, invoiceNumber: null })).toBe("School fees");
  });
});
