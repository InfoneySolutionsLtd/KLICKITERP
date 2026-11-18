import { dirname, join } from "node:path";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
// `import = require()` on purpose: pdfmake exports a class INSTANCE whose methods live on its prototype, which a namespace
// import would not copy (the same note, and the same reason, as the report renderer).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import pdfmake = require("pdfmake");

/** What the printed receipt says. Every amount is an exact decimal string (4 places) exactly as the books hold it. */
export interface ReceiptPdfData {
  number: string;
  /** `YYYY-MM-DD`. */
  date: string;
  status: "POSTED" | "REVERSED";
  amount: string;
  payerName: string;
  learnerName: string;
  admissionNo: string;
  className: string | null;
  methods: Array<{ label: string; amount: string; reference: string | null }>;
  /** Which invoices the money went to (or "advance payment"), already readable — never raw ids. */
  appliedTo: Array<{ label: string; amount: string }>;
  /** The learner's whole account now (see `ReceiptPdfAccount`). */
  account: ReceiptPdfAccount;
}

/** One invoice on the learner's account, as it stands now. */
export interface ReceiptPdfInvoice {
  number: string;
  /** e.g. `2026 Term 1`. */
  termName: string | null;
  /** The invoice amount, what has been paid on it so far, and what is still owing. Exact decimal strings (4 places). */
  total: string;
  paid: string;
  balance: string;
  /** How much of THIS receipt went to this invoice; null when none did (it is listed only because something is still owing). */
  paidByThisReceipt: string | null;
  /** The fee categories on the invoice, so a parent can see what the money is for. `amount` is after any discount. */
  categories: Array<{ name: string; amount: string; discount: string | null }>;
}

/**
 * Where the learner stands across ALL their invoices, worked out from the invoices themselves (the same figures the parent
 * portal shows) at the moment the PDF is made — not a figure frozen onto the receipt when it was captured.
 */
export interface ReceiptPdfAccount {
  /** The invoices to list: those this receipt paid toward first, then the rest that still owe something. */
  invoices: ReceiptPdfInvoice[];
  /** Open invoices that did not fit in the list; they ARE counted in `totalBalance`. */
  moreInvoices: number;
  /** What the learner owes across every open invoice. */
  totalBalance: string;
}

/** What the Branding page configures for printed documents; every part is optional (an unbranded school still gets a receipt). */
export interface ReceiptPdfBranding {
  logo: Buffer | null;
  headerText: string | null;
  footerText: string | null;
}

/** The QR code and the short reference that let anyone check this receipt is genuine (`DocumentVerificationService`). */
export interface ReceiptPdfVerification {
  /** The public `/verify/<token>` address the QR code encodes. */
  url: string;
  reference: string;
}

export interface ReceiptPdfInput {
  receipt: ReceiptPdfData;
  branding: ReceiptPdfBranding;
  /** Null for a receipt that predates verification tokens: it is printed without a QR code rather than with a made-up one. */
  verification: ReceiptPdfVerification | null;
  generatedAt: Date;
  /** IANA zone for the "generated" time; defaults to the process's own (`TZ`). */
  timeZone?: string;
}

const PRODUCT_NAME = "Klickit Finance ERP";
const CURRENCY = "KES";
const MARGIN = 40;
const GRAY = "#6b7280";
const RULE = "#d1d5db";
const RED = "#b91c1c";
const MAX_LOGO: [number, number] = [110, 50];

const FONT_DIR = join(dirname(require.resolve("pdfmake/package.json")), "fonts", "Roboto");
let configured = false;

/**
 * One-time pdfmake setup (a process-wide singleton, so idempotent — the report renderer sets exactly the same values). The
 * document may only embed `data:` images and pdfmake's own fonts: nothing in a receipt can reach the network or the
 * filesystem.
 */
function ensurePdfmakeConfigured(): void {
  if (configured) return;
  pdfmake.setFonts({
    Roboto: {
      normal: join(FONT_DIR, "Roboto-Regular.ttf"),
      bold: join(FONT_DIR, "Roboto-Medium.ttf"),
      italics: join(FONT_DIR, "Roboto-Italic.ttf"),
      bolditalics: join(FONT_DIR, "Roboto-MediumItalic.ttf"),
    },
  });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((path) => path.startsWith(FONT_DIR));
  configured = true;
}

/** pdfmake embeds only PNG and JPEG; anything else (SVG, WebP, ...) is skipped rather than crashing the receipt. */
export function imageDataUrl(buffer: Buffer): string | null {
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }
  return null;
}

/**
 * `"2500.0000"` -> `"KES 2,500.00"`; `"2500.5000"` -> `"KES 2,500.50"`; a sub-cent amount keeps its extra places
 * (`"2500.1250"` -> `"KES 2,500.125"`). Pure string work: money never goes through a floating-point number.
 */
export function formatKes(decimal: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec((decimal ?? "").trim());
  if (!match) return `${CURRENCY} ${decimal}`;
  const [, sign, whole, fraction = ""] = match;
  const trimmed = fraction.replace(/0+$/, "");
  const places = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed;
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${CURRENCY} ${grouped}.${places}`;
}

/** `2026-03-10` -> `10 March 2026` (no time zone involved: a receipt date is a calendar date). */
export function formatReceiptDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = months[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : date;
}

function formatGenerated(at: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", ...(timeZone ? { timeZone } : {}) }).format(at);
}

const labelCell = (text: string): TableCell => ({ text, color: GRAY, fontSize: 9, margin: [0, 3, 0, 3] });
const valueCell = (text: string | Content[], bold = false): TableCell => ({ text: text as string, bold, fontSize: 10, margin: [0, 3, 0, 3] });

const NUMBER_COL = 86;

/**
 * "Account balance": the learner's total balance across all their open invoices, then each invoice with its amount, what has
 * been paid on it and what is left, and the fee categories it is made of — so a parent can see what they have paid for and
 * what is still owing. The figures are as at the moment the PDF is made, and the heading says so.
 */
function accountSection(receipt: ReceiptPdfData, generatedAt: Date, timeZone?: string): Content[] {
  const { account } = receipt;
  const owing = !/^-?0+(.0+)?$/.test(account.totalBalance);
  const widths: Array<number | string> = ["*", NUMBER_COL, NUMBER_COL, NUMBER_COL];
  const right = (text: string, extra: Record<string, unknown> = {}): TableCell => ({ text, alignment: "right", fontSize: 10, ...extra }) as TableCell;
  const cols = (...cells: TableCell[]): TableCell[] => cells;

  const out: Content[] = [
    { text: "Account balance", bold: true, fontSize: 11, margin: [0, 18, 0, 0] },
    { text: `As at ${formatGenerated(generatedAt, timeZone)}, across all of ${receipt.learnerName}'s open invoices.`, fontSize: 8.5, color: GRAY, margin: [0, 2, 0, 6] },
    {
      margin: [0, 0, 0, 6],
      table: { widths: ["*", "auto"], body: [[{ text: `Total balance for ${receipt.learnerName}`, bold: true, fontSize: 11 }, { text: formatKes(account.totalBalance), bold: true, fontSize: 15, alignment: "right", color: owing ? "#111827" : "#166534" }]] },
      layout: { hLineColor: () => RULE, vLineColor: () => RULE, hLineWidth: () => 0.8, vLineWidth: () => 0, paddingTop: () => 7, paddingBottom: () => 7 },
    },
  ];

  if (account.invoices.length === 0) {
    out.push({ text: owing ? "" : "Nothing is owing on the account.", fontSize: 9, color: GRAY });
    return out;
  }

  out.push({
    table: {
      widths,
      body: [cols({ text: "Invoice and fee categories", color: GRAY, fontSize: 8.5 }, right("Invoice amount", { color: GRAY, fontSize: 8.5 }), right("Paid", { color: GRAY, fontSize: 8.5 }), right("Balance", { color: GRAY, fontSize: 8.5 }))],
    },
    layout: { hLineColor: () => RULE, hLineWidth: (i: number) => (i === 1 ? 0.8 : 0), vLineWidth: () => 0 },
  });

  for (const invoice of account.invoices) {
    const heading: Content[] = [{ text: `Invoice ${invoice.number}${invoice.termName ? `  (${invoice.termName})` : ""}`, bold: true, fontSize: 10 }];
    if (invoice.paidByThisReceipt !== null) {
      heading.push({ text: `This receipt paid ${formatKes(invoice.paidByThisReceipt)} toward this invoice`, fontSize: 8, color: GRAY, margin: [0, 1, 0, 0] });
    }
    const rows: TableCell[][] = [
      cols({ stack: heading, margin: [0, 3, 0, 2] }, right(formatKes(invoice.total), { margin: [0, 3, 0, 2] }), right(formatKes(invoice.paid), { margin: [0, 3, 0, 2] }), right(formatKes(invoice.balance), { bold: true, margin: [0, 3, 0, 2] })),
      ...invoice.categories.map((category) =>
        cols(
          { text: `${category.name}${category.discount ? `  (after ${formatKes(category.discount)} discount)` : ""}`, fontSize: 8.5, color: GRAY, margin: [12, 0, 0, 1] },
          right(formatKes(category.amount), { fontSize: 8.5, color: GRAY, margin: [0, 0, 0, 1] }),
          { text: "" },
          { text: "" },
        ),
      ),
    ];
    // One invoice never splits across two pages.
    out.push({ unbreakable: true, table: { widths, body: rows }, layout: { hLineColor: () => RULE, hLineWidth: (i: number) => (i === rows.length ? 0.4 : 0), vLineWidth: () => 0, paddingTop: () => 0, paddingBottom: () => 0 } });
  }

  if (account.moreInvoices > 0) {
    out.push({ text: `…and ${account.moreInvoices} more open invoice${account.moreInvoices === 1 ? "" : "s"}, included in the total balance above.`, fontSize: 8.5, color: GRAY, margin: [0, 4, 0, 0] });
  }
  return out;
}

export function buildReceiptDocDefinition(input: ReceiptPdfInput): TDocumentDefinitions {
  const { receipt, branding, verification } = input;
  const reversed = receipt.status === "REVERSED";
  const logoUrl = branding.logo ? imageDataUrl(branding.logo) : null;

  const header: Content = {
    columns: [
      ...(logoUrl ? [{ image: logoUrl, fit: MAX_LOGO, width: MAX_LOGO[0] + 10 } as Content] : []),
      {
        stack: [
          ...(branding.headerText ? [{ text: branding.headerText, bold: true, fontSize: 14 } as Content] : []),
          { text: "PAYMENT RECEIPT", fontSize: 11, color: GRAY, margin: [0, branding.headerText ? 2 : 0, 0, 0] } as Content,
        ],
        width: "*",
      },
      {
        stack: [
          { text: `Receipt ${receipt.number}`, bold: true, fontSize: 12, alignment: "right" },
          { text: formatReceiptDate(receipt.date), fontSize: 10, color: GRAY, alignment: "right" },
          // The QR code ties the receipt to the school that issued it, so it sits in the header: on the FIRST page of every
          // receipt, however long the account below it runs.
          ...(verification
            ? [
                { qr: verification.url, fit: 62, alignment: "right", margin: [0, 6, 0, 0] } as Content,
                { text: "Scan to verify", fontSize: 7, color: GRAY, alignment: "right", margin: [0, 1, 0, 0] } as Content,
              ]
            : []),
        ],
        width: "auto",
      },
    ],
    columnGap: 10,
  };

  const details: TableCell[][] = [
    [labelCell("Received from"), valueCell(receipt.payerName)],
    [labelCell("Learner"), valueCell(`${receipt.learnerName}${receipt.className ? ` (${receipt.className})` : ""}`)],
    [labelCell("Admission number"), valueCell(receipt.admissionNo)],
    ...receipt.methods.map((method, index): TableCell[] => [
      labelCell(index === 0 ? (receipt.methods.length > 1 ? "Paid by (split)" : "Paid by") : ""),
      valueCell(`${method.label}${method.reference ? `  -  ref. ${method.reference}` : ""}${receipt.methods.length > 1 ? `   ${formatKes(method.amount)}` : ""}`),
    ]),
  ];

  const body: Content[] = [
    header,
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.8, lineColor: RULE }], margin: [0, 10, 0, 14] },
  ];

  if (reversed) {
    body.push({
      text: "THIS RECEIPT HAS BEEN REVERSED by the school and no longer counts as a payment.",
      color: RED,
      bold: true,
      fontSize: 10,
      margin: [0, 0, 0, 10],
    });
  }

  body.push(
    { table: { widths: [110, "*"], body: details }, layout: "noBorders" },
    {
      margin: [0, 14, 0, 0],
      table: { widths: ["*", "auto"], body: [[{ text: "Amount received", bold: true, fontSize: 12 }, { text: formatKes(receipt.amount), bold: true, fontSize: 16, alignment: "right" }]] },
      layout: { hLineColor: () => RULE, vLineColor: () => RULE, hLineWidth: () => 0.8, vLineWidth: () => 0 , paddingTop: () => 8, paddingBottom: () => 8 },
    },
  );

  if (receipt.appliedTo.length > 0) {
    body.push(
      { text: "Applied to", bold: true, fontSize: 10, margin: [0, 16, 0, 4] },
      {
        table: {
          widths: ["*", "auto"],
          body: [
            [{ text: "Item", color: GRAY, fontSize: 9 }, { text: "Amount", color: GRAY, fontSize: 9, alignment: "right" }],
            ...receipt.appliedTo.map((line): TableCell[] => [{ text: line.label, fontSize: 10 }, { text: formatKes(line.amount), fontSize: 10, alignment: "right" }]),
          ],
        },
        layout: { hLineColor: () => RULE, vLineColor: () => RULE, hLineWidth: (i: number) => (i === 1 ? 0.8 : 0.3), vLineWidth: () => 0 },
      },
    );
  }

  body.push(...accountSection(receipt, input.generatedAt, input.timeZone));

  if (verification) {
    // The QR code itself is in the header; this is how to use it (and the address, for anyone who cannot scan).
    body.push({
      margin: [0, 22, 0, 0],
      stack: [
        { text: "Verify this receipt", bold: true, fontSize: 9 },
        { text: "Scan the code at the top of this receipt, or open the address below, to check that it is genuine.", fontSize: 8, color: GRAY, margin: [0, 2, 0, 2] },
        { text: verification.url, fontSize: 8, color: GRAY },
        { text: `Reference ${verification.reference}`, fontSize: 8, color: GRAY, margin: [0, 2, 0, 0] },
      ],
    });
  }

  return {
    info: { title: `Receipt ${receipt.number}`, creator: PRODUCT_NAME, producer: PRODUCT_NAME },
    pageSize: "A4",
    pageMargins: [MARGIN, MARGIN, MARGIN, 60],
    defaultStyle: { font: "Roboto", fontSize: 10 },
    ...(reversed ? { watermark: { text: "REVERSED", color: RED, opacity: 0.12, bold: true } } : {}),
    content: body,
    footer: () => ({
      margin: [MARGIN, 0, MARGIN, 0],
      stack: [
        ...(branding.footerText ? [{ text: branding.footerText, fontSize: 8, color: GRAY, alignment: "center" } as Content] : []),
        { text: `Generated ${formatGenerated(input.generatedAt, input.timeZone)} by ${PRODUCT_NAME}`, fontSize: 7, color: GRAY, alignment: "center", margin: [0, 2, 0, 0] },
      ],
    }),
  };
}

/** Renders the receipt to PDF bytes. */
export async function renderReceiptPdf(input: ReceiptPdfInput): Promise<Buffer> {
  ensurePdfmakeConfigured();
  return pdfmake.createPdf(buildReceiptDocDefinition(input)).getBuffer();
}
