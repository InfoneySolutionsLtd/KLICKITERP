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

  if (verification) {
    body.push({
      margin: [0, 26, 0, 0],
      columns: [
        { qr: verification.url, fit: 70, width: 70 },
        {
          stack: [
            { text: "Verify this receipt", bold: true, fontSize: 9 },
            { text: "Scan the code, or open the address below, to check that this receipt is genuine.", fontSize: 8, color: GRAY, margin: [0, 2, 0, 2] },
            { text: verification.url, fontSize: 8, color: GRAY },
            { text: `Reference ${verification.reference}`, fontSize: 8, color: GRAY, margin: [0, 2, 0, 0] },
          ],
          margin: [8, 4, 0, 0],
        },
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
