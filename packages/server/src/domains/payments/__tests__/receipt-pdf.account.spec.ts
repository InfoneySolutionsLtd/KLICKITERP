import {
  buildReceiptDocDefinition,
  renderReceiptPdf,
  type ReceiptPdfAccount,
  type ReceiptPdfData,
  type ReceiptPdfInput,
  type ReceiptPdfInvoice,
} from "../application/receipt-pdf/receipt-pdf.renderer";

/**
 * The receipt shows where the learner stands across ALL their invoices: a total balance, then each invoice with its amount, what
 * has been paid on it and what is left, and the fee categories it is made of — so a parent can see what they paid for.
 */
const invoice = (over: Partial<ReceiptPdfInvoice> = {}): ReceiptPdfInvoice => ({
  number: "BIL-000158",
  termName: "2026 Term 1",
  total: "1000.0000",
  paid: "500.0000",
  balance: "500.0000",
  paidByThisReceipt: "500.0000",
  categories: [{ name: "Tuition", amount: "1000.0000", discount: null }],
  ...over,
});

const receipt = (account: ReceiptPdfAccount, over: Partial<ReceiptPdfData> = {}): ReceiptPdfData => ({
  number: "RCP-000042",
  date: "2026-03-10",
  status: "POSTED",
  amount: "500.0000",
  payerName: "Wanjiru Kamau",
  learnerName: "Amina Wanjiru Kamau",
  admissionNo: "ADM-1001",
  className: "Grade 4",
  methods: [{ label: "M-Pesa", amount: "500.0000", reference: "QWE123XYZ9" }],
  appliedTo: [{ label: "Invoice BIL-000158", amount: "500.0000" }],
  account,
  ...over,
});

const input = (data: ReceiptPdfData): ReceiptPdfInput => ({
  receipt: data,
  branding: { logo: null, headerText: "Sunrise Academy", footerText: null },
  verification: null,
  generatedAt: new Date("2026-11-18T10:24:00Z"),
  timeZone: "Africa/Nairobi",
});

const texts = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => texts(v, out));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((v) => texts(v, out));
  return out;
};
const printed = (data: ReceiptPdfData): string => texts(buildReceiptDocDefinition(input(data)).content).join("\n");

/** The example from the school: two invoices of KES 1,000 each; the parent pays 500 toward one. */
const EXAMPLE: ReceiptPdfAccount = {
  totalBalance: "1500.0000",
  moreInvoices: 0,
  invoices: [
    invoice(),
    invoice({ number: "BIL-000159", paid: "0.0000", balance: "1000.0000", paidByThisReceipt: null, categories: [{ name: "Transport", amount: "1000.0000", discount: null }] }),
  ],
};

describe("the account balance on a receipt", () => {
  it("shows the TOTAL balance across all invoices: 2 invoices of 1,000, 500 paid -> 1,500", () => {
    const text = printed(receipt(EXAMPLE));
    expect(text).toContain("Account balance");
    expect(text).toContain("Total balance for Amina Wanjiru Kamau");
    expect(text).toContain("KES 1,500.00");
  });

  it("lists each invoice with its amount, what has been paid and what is left", () => {
    const text = printed(receipt(EXAMPLE));
    expect(text).toContain("Invoice amount");
    expect(text).toContain("Paid");
    expect(text).toContain("Balance");
    // BIL-000158: 1,000 / paid 500 / balance 500 ; BIL-000159: 1,000 / paid 0 / balance 1,000
    expect(text).toContain("Invoice BIL-000158  (2026 Term 1)");
    expect(text).toContain("Invoice BIL-000159  (2026 Term 1)");
    const cells = texts(buildReceiptDocDefinition(input(receipt(EXAMPLE))).content);
    expect(cells.filter((c) => c === "KES 1,000.00").length).toBeGreaterThanOrEqual(4); // two invoice amounts + two category lines
    expect(cells).toContain("KES 500.00");
    expect(cells).toContain("KES 0.00");
  });

  it("lists the fee categories under their invoice, so the parent knows what they paid for", () => {
    const account: ReceiptPdfAccount = {
      totalBalance: "21500.0000",
      moreInvoices: 0,
      invoices: [invoice({ total: "21500.0000", paid: "0.0000", balance: "21500.0000", paidByThisReceipt: null, categories: [{ name: "Tuition", amount: "20000.0000", discount: null }, { name: "Transport", amount: "1500.0000", discount: null }] })],
    };
    const text = printed(receipt(account));
    const invoiceAt = text.indexOf("Invoice BIL-000158");
    expect(invoiceAt).toBeGreaterThan(-1);
    expect(text.indexOf("Tuition")).toBeGreaterThan(invoiceAt);
    expect(text.indexOf("Transport")).toBeGreaterThan(text.indexOf("Tuition"));
    expect(text).toContain("KES 20,000.00");
    expect(text).toContain("KES 1,500.00");
  });

  it("shows a fee category's amount AFTER any discount, and says so", () => {
    const account: ReceiptPdfAccount = { totalBalance: "10000.0000", moreInvoices: 0, invoices: [invoice({ total: "10000.0000", paid: "0.0000", balance: "10000.0000", paidByThisReceipt: null, categories: [{ name: "Tuition", amount: "10000.0000", discount: "2000.0000" }] })] };
    expect(printed(receipt(account))).toContain("Tuition  (after KES 2,000.00 discount)");
  });

  it("marks the invoice this receipt paid toward (the Paid column is the running total, so this tells them which one moved)", () => {
    const text = printed(receipt(EXAMPLE));
    expect(text.match(/This receipt paid KES 500\.00 toward this invoice/g)).toHaveLength(1);
  });

  it("says the figures are as at the moment the PDF is made", () => {
    expect(printed(receipt(EXAMPLE))).toMatch(/As at 18 November 2026 at 13:24, across all of Amina Wanjiru Kamau.s open invoices/);
  });

  it("a fully paid invoice this receipt settled is still listed, with nothing owing on it", () => {
    const account: ReceiptPdfAccount = { totalBalance: "0.0000", moreInvoices: 0, invoices: [invoice({ total: "500.0000", paid: "500.0000", balance: "0.0000" })] };
    const cells = texts(buildReceiptDocDefinition(input(receipt(account))).content);
    expect(cells).toContain("Invoice BIL-000158  (2026 Term 1)");
    expect(cells.filter((c) => c === "KES 0.00").length).toBeGreaterThanOrEqual(2); // the invoice balance and the total
  });

  it("with nothing owing and no invoice to show, says so plainly", () => {
    const text = printed(receipt({ totalBalance: "0.0000", moreInvoices: 0, invoices: [] }));
    expect(text).toContain("KES 0.00");
    expect(text).toContain("Nothing is owing on the account.");
  });

  it("does not claim nothing is owing when invoices are not listed", () => {
    expect(printed(receipt({ totalBalance: "300.0000", moreInvoices: 1, invoices: [] }))).not.toContain("Nothing is owing");
  });

  it("when more invoices are open than fit, says how many more and that they are in the total", () => {
    expect(printed(receipt({ ...EXAMPLE, moreInvoices: 3 }))).toContain("…and 3 more open invoices, included in the total balance above.");
    expect(printed(receipt({ ...EXAMPLE, moreInvoices: 1 }))).toContain("…and 1 more open invoice, included in the total balance above.");
    expect(printed(receipt(EXAMPLE))).not.toContain("more open invoice");
  });

  it("an invoice is never split across two pages", () => {
    const body = JSON.stringify(buildReceiptDocDefinition(input(receipt(EXAMPLE))).content);
    expect((body.match(/"unbreakable":true/g) ?? []).length).toBe(2);
  });

  it("never prints a free-text line description (those can carry internal ids), only the fee category", () => {
    const text = printed(receipt(EXAMPLE));
    expect(text).not.toMatch(/batch|cheque CHQ|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("works on a reversed receipt too (the account is still the account)", () => {
    const text = printed(receipt(EXAMPLE, { status: "REVERSED" }));
    expect(text).toContain("HAS BEEN REVERSED");
    expect(text).toContain("Total balance for Amina Wanjiru Kamau");
  });
});

describe("rendering the account into real PDF bytes", () => {
  it("renders the example", async () => {
    const buffer = await renderReceiptPdf(input(receipt(EXAMPLE)));
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.subarray(-8).toString()).toContain("%%EOF");
  });

  it("a learner with 25 open invoices of 8 categories each still renders (onto more pages), and is bigger than one page", async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      invoice({
        number: `BIL-${String(100 + i).padStart(6, "0")}`,
        paidByThisReceipt: i === 0 ? "500.0000" : null,
        categories: Array.from({ length: 8 }, (_, c) => ({ name: `Fee category number ${c + 1}`, amount: "125.0000", discount: c === 0 ? "10.0000" : null })),
      }),
    );
    const small = await renderReceiptPdf(input(receipt(EXAMPLE)));
    const big = await renderReceiptPdf(input(receipt({ totalBalance: "12500.0000", moreInvoices: 4, invoices: many })));
    expect(big.subarray(0, 5).toString()).toBe("%PDF-");
    expect(big.length).toBeGreaterThan(small.length);
  });

  it("long fee category names and amounts in the millions do not break it", async () => {
    const account: ReceiptPdfAccount = {
      totalBalance: "123456789.5000",
      moreInvoices: 0,
      invoices: [invoice({ total: "123456789.5000", paid: "0.0000", balance: "123456789.5000", categories: [{ name: "A very long fee category name that goes on and on and on for quite a while", amount: "123456789.5000", discount: null }] })],
    };
    expect((await renderReceiptPdf(input(receipt(account)))).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
