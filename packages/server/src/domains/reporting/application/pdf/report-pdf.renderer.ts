import { dirname, join } from "node:path";
import type { Content, ContextPageSize, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
// `import = require()` on purpose: pdfmake exports a class INSTANCE whose methods live on its prototype,
// which a namespace import (`import * as`) would not copy — `createPdf` would be undefined at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import pdfmake = require("pdfmake");
import type { ReportColumnDef } from "../report-registry.service";
import { formatCell, formatDateTime, summarizeTotals } from "./report-formatters";

/** A branding image already loaded into memory (logo / signature). */
export interface ImageAsset {
  buffer: Buffer;
}

/** Everything the Branding page configures that a report prints (FR-BRND-002.1 "Documents"). */
export interface ReportPdfBranding {
  logo: ImageAsset | null;
  /** Letterhead line next to the logo. */
  headerText: string | null;
  footerText: string | null;
  watermarkText: string | null;
  signatures: ImageAsset[];
}

/** What the QR code / footer prove — see `DocumentVerificationService` and `computeReportFingerprint()`. */
export interface ReportPdfVerification {
  /** Full public verification URL encoded in the QR code. */
  url: string;
  /** Short human reference, e.g. "RPT-0194A7C2". */
  reference: string;
  /** Hex SHA-256 of the report data; the first 16 characters are printed. */
  fingerprint: string;
}

export interface ReportPdfInput {
  title: string;
  columns: ReportColumnDef[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  /** Already-readable "Student: Name (adm. no.)" lines — never raw ids. */
  paramLines: { label: string; value: string }[];
  branding: ReportPdfBranding;
  generatedAt: Date;
  generatedBy: string | null;
  verification: ReportPdfVerification;
  /** IANA zone; defaults to the process's own (`TZ`). */
  timeZone?: string;
}

const PRODUCT_NAME = "Klickit Finance ERP";
const MARGIN = 36;
/** Room for the footer (QR 52pt + page number) below the body. */
const BOTTOM_MARGIN = 92;

// Letterhead geometry (pt). The top page margin is computed from these, not fixed — see `headerBlockHeight()`.
const HEADER_TOP = 18;
const MAX_LOGO_SIZE: [number, number] = [120, 54];
const HEADER_FONT_SIZE = 12;
const HEADER_LINE_HEIGHT = 15;
/** Rough average glyph width of bold Roboto at `HEADER_FONT_SIZE` — only used to guess how many lines the header text wraps to. */
const HEADER_AVG_CHAR_WIDTH = HEADER_FONT_SIZE * 0.58;
const LOGO_TEXT_GAP = 4;
const TITLE_FONT_SIZE = 9;
const TITLE_LINE_HEIGHT = 12;
/** Width reserved for the report title in the header's top-right corner. */
const TITLE_BOX_WIDTH = 160;
const HEADER_RULE_GAP = 6;
const HEADER_BODY_GAP = 14;
const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const MAX_SIGNATURE_SIZE: [number, number] = [130, 50];
const FINGERPRINT_CHARS = 16;

/** Usable width of a portrait / landscape A4 page, in pt. */
const PORTRAIT_CONTENT_WIDTH = A4_WIDTH - 2 * MARGIN;
const LANDSCAPE_CONTENT_WIDTH = A4_HEIGHT - 2 * MARGIN;
const TABLE_FONT_SIZE = 8.5;
/** Rough average glyph width of Roboto at `TABLE_FONT_SIZE`, and a cell's left+right padding — for the orientation estimate only. */
const AVG_CHAR_WIDTH = TABLE_FONT_SIZE * 0.52;
const CELL_PADDING_WIDTH = 8;
/** Text columns wrap, so a long value must not by itself push the whole report to landscape. */
const MAX_WRAP_CHARS = 24;

const GRAY = "#6b7280";
const RULE_COLOR = "#9ca3af";

const FONT_DIR = join(dirname(require.resolve("pdfmake/package.json")), "fonts", "Roboto");

let pdfmakeConfigured = false;

/**
 * One-time pdfmake setup. It is a process-wide singleton, so this is idempotent. Fonts are the
 * Roboto files shipped inside the package. Both access policies are locked down: a report
 * document only ever embeds `data:` images and its own fonts, so it may never fetch a URL
 * and may only read pdfmake's own font folder (no report content can reach the filesystem
 * or the network).
 */
function ensurePdfmakeConfigured(): void {
  if (pdfmakeConfigured) return;
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
  pdfmakeConfigured = true;
}

/** pdfmake (via pdfkit) embeds only PNG and JPEG; anything else (SVG, WebP, GIF...) must be skipped, not crash the export. */
export function detectImageMime(buffer: Buffer): "image/png" | "image/jpeg" | null {
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/** `data:` URL for an embeddable image, or null when the format is not one pdfmake can embed. */
function toDataUrl(asset: ImageAsset): string | null {
  const mime = detectImageMime(asset.buffer);
  return mime ? `data:${mime};base64,${asset.buffer.toString("base64")}` : null;
}

function isNumeric(type: ReportColumnDef["type"]): boolean {
  return type === "money" || type === "number";
}

/**
 * Would this table fit a portrait A4 page? Sums an estimated width per column — the widest of its
 * label and its (formatted) cells, in average glyph widths, plus padding. Number/date columns
 * cannot wrap so they count in full; text columns wrap, so they are capped at `MAX_WRAP_CHARS`.
 * An estimate, not a layout pass — good enough to choose an orientation, and cheap.
 */
function estimateTableWidth(columns: ReportColumnDef[], cells: string[][]): number {
  return columns.reduce((total, column, index) => {
    const widest = cells.reduce((max, row) => Math.max(max, row[index].length), column.label.length);
    const chars = column.type === "string" ? Math.min(widest, MAX_WRAP_CHARS) : widest;
    return total + chars * AVG_CHAR_WIDTH + CELL_PADDING_WIDTH;
  }, 0);
}

/**
 * Height the letterhead needs, so the top page margin can be sized to it: a long header text
 * that wraps onto two or three lines (the Branding field allows 200 characters) would otherwise
 * run into the table. The report title sits in the top-right corner beside the logo, so it only
 * costs height when there is NO logo to sit beside (then it becomes a small centred line).
 * Wrapping is estimated from the average glyph width — an estimate, with a gap left for slack.
 */
function headerBlockHeight(hasLogo: boolean, headerText: string | null, contentWidth: number): number {
  const textLines = headerText ? Math.max(1, Math.ceil((headerText.length * HEADER_AVG_CHAR_WIDTH) / contentWidth)) : 0;
  const logoHeight = hasLogo ? MAX_LOGO_SIZE[1] : 0;
  const textHeight = textLines > 0 ? (hasLogo ? LOGO_TEXT_GAP : 0) + textLines * HEADER_LINE_HEIGHT : 0;
  const titleHeight = hasLogo ? 0 : TITLE_LINE_HEIGHT;
  return HEADER_TOP + logoHeight + textHeight + titleHeight + HEADER_RULE_GAP + 1;
}

function pageContentWidth(pageSize: ContextPageSize): number {
  return pageSize.width - 2 * MARGIN;
}

function ruleLine(width: number): Content {
  return { canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.7, lineColor: RULE_COLOR }] };
}

/**
 * The branded, verifiable document for one report run — pure: it only builds the
 * pdfmake definition (testable without rendering a PDF). Layout:
 *  - portrait A4, or landscape when the table's estimated width would not fit portrait;
 *  - every page header: the logo centred on top with the letterhead text centred beneath it,
 *    the report title small in the top-right corner, then a rule;
 *  - every page footer: footer text, "Generated <date time> by <name>", reference +
 *    data fingerprint, the verification QR and "Page x of y" (so a swapped or missing
 *    page is evident, and every page verifies on its own);
 *  - a diagonal watermark;
 *  - body: title, readable parameters, the data table (header row repeats on each page),
 *    a summary of the report's totals, then the signature images.
 */
export function buildReportDocDefinition(input: ReportPdfInput): TDocumentDefinitions {
  const { branding, verification, columns, rows } = input;
  const logoDataUrl = branding.logo ? toDataUrl(branding.logo) : null;
  const signatureDataUrls = branding.signatures.map(toDataUrl).filter((url): url is string => url !== null);
  // Formatted once: drives both the table body and the orientation choice.
  const cells = rows.map((row) => columns.map((column) => formatCell(row[column.key], column.type, input.timeZone)));
  const landscape = estimateTableWidth(columns, cells) > PORTRAIT_CONTENT_WIDTH;
  const stamp = formatDateTime(input.generatedAt, input.timeZone);
  const generatedLine = `Generated ${stamp}${input.generatedBy ? ` by ${input.generatedBy}` : ""}`;
  const shortFingerprint = verification.fingerprint.slice(0, FINGERPRINT_CHARS);

  const topMargin = Math.max(
    headerBlockHeight(logoDataUrl !== null, branding.headerText, landscape ? LANDSCAPE_CONTENT_WIDTH : PORTRAIT_CONTENT_WIDTH) + HEADER_BODY_GAP,
    56,
  );

  // Letterhead: the logo on top, the header text beneath it, both centred, then a rule. The report
  // title stays small in the top-right corner (absolutely positioned, so it never disturbs the
  // centring) — or, with no logo for it to sit beside, becomes a small centred line under the header.
  const header = (_currentPage: number, _pageCount: number, pageSize: ContextPageSize): Content => ({
    stack: [
      {
        margin: [MARGIN, HEADER_TOP, MARGIN, 0],
        stack: [
          ...(logoDataUrl ? [{ image: logoDataUrl, fit: MAX_LOGO_SIZE, alignment: "center" as const }] : []),
          ...(branding.headerText
            ? [
                {
                  text: branding.headerText,
                  bold: true,
                  fontSize: HEADER_FONT_SIZE,
                  alignment: "center" as const,
                  margin: [0, logoDataUrl ? LOGO_TEXT_GAP : 0, 0, 0] as [number, number, number, number],
                },
              ]
            : []),
          ...(logoDataUrl ? [] : [{ text: input.title, color: GRAY, fontSize: TITLE_FONT_SIZE, alignment: "center" as const }]),
          { margin: [0, HEADER_RULE_GAP, 0, 0], stack: [ruleLine(pageContentWidth(pageSize))] },
        ],
      },
      ...(logoDataUrl
        ? [
            {
              absolutePosition: { x: pageSize.width - MARGIN - TITLE_BOX_WIDTH, y: HEADER_TOP + 2 },
              columns: [{ width: TITLE_BOX_WIDTH, text: input.title, color: GRAY, fontSize: TITLE_FONT_SIZE, alignment: "right" as const }],
            },
          ]
        : []),
    ],
  });

  const footer = (currentPage: number, pageCount: number, pageSize: ContextPageSize): Content => ({
    margin: [MARGIN, 6, MARGIN, 0],
    stack: [
      ruleLine(pageContentWidth(pageSize)),
      {
        margin: [0, 4, 0, 0],
        columns: [
          {
            width: "*",
            stack: [
              ...(branding.footerText ? [{ text: branding.footerText, fontSize: 8, bold: true }] : []),
              { text: generatedLine, fontSize: 8, color: GRAY },
              { text: `Ref ${verification.reference}  ·  Data fingerprint ${shortFingerprint}`, fontSize: 7, color: GRAY },
              { text: "Scan the QR code to verify this report.", fontSize: 7, color: GRAY },
            ],
          },
          {
            width: "auto",
            stack: [
              { qr: verification.url, fit: 52, alignment: "right" },
              { text: `Page ${currentPage} of ${pageCount}`, fontSize: 8, alignment: "right", margin: [0, 2, 0, 0] },
            ],
          },
        ],
      },
    ],
  });

  const content: Content[] = [
    { text: input.title, style: "title" },
    { text: `${rows.length.toLocaleString("en-US")} record${rows.length === 1 ? "" : "s"}`, color: GRAY, margin: [0, 0, 0, 6] },
  ];

  if (input.paramLines.length > 0) {
    content.push({
      table: {
        widths: ["auto", "*"],
        body: input.paramLines.map((line): TableCell[] => [
          { text: `${line.label}:`, bold: true, color: GRAY },
          { text: line.value },
        ]),
      },
      layout: "noBorders",
      margin: [0, 0, 0, 10],
    });
  }

  if (rows.length === 0) {
    content.push({ text: "No records match these parameters.", italics: true, color: GRAY, margin: [0, 6, 0, 0] });
  } else {
    const headerRow: TableCell[] = columns.map((column) => ({
      text: column.label,
      style: "th",
      alignment: isNumeric(column.type) ? "right" : "left",
    }));
    const body: TableCell[][] = cells.map((rowCells) =>
      rowCells.map((text, index) => ({ text, alignment: isNumeric(columns[index].type) ? "right" : "left" })),
    );

    // Text columns take the spare width; numbers/dates size to their content. At least one column must be "*".
    const widths: (string | number)[] = columns.map((column) =>
      column.type === "string" ? "*" : "auto",
    );
    if (!widths.includes("*")) widths[0] = "*";

    content.push({
      table: { headerRows: 1, dontBreakRows: true, widths, body: [headerRow, ...body] },
      layout: {
        hLineWidth: (index, node) => (index === 0 || index === 1 || index === node.table.body.length ? 0.7 : 0.25),
        vLineWidth: () => 0,
        hLineColor: () => "#d1d5db",
        fillColor: (rowIndex) => (rowIndex === 0 ? "#e5e7eb" : rowIndex % 2 === 0 ? "#f8fafc" : null),
        paddingTop: () => 3,
        paddingBottom: () => 3,
        paddingLeft: () => 4,
        paddingRight: () => 4,
      },
    });
  }

  const summary = summarizeTotals(input.totals, input.timeZone);
  if (summary.length > 0) {
    content.push(
      { text: "Summary", style: "h2", margin: [0, 14, 0, 4] },
      {
        unbreakable: true,
        table: {
          widths: [240, "auto"],
          body: summary.map((line): TableCell[] => [
            { text: line.label, color: GRAY },
            { text: line.value, bold: true, alignment: "right" },
          ]),
        },
        layout: {
          hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? 0.7 : 0.25),
          vLineWidth: () => 0,
          hLineColor: () => "#d1d5db",
          paddingTop: () => 2,
          paddingBottom: () => 2,
        },
      },
    );
  }

  if (signatureDataUrls.length > 0) {
    content.push({
      unbreakable: true,
      margin: [0, 32, 0, 0],
      columnGap: 24,
      columns: signatureDataUrls.map((url) => ({
        width: 150,
        stack: [
          { image: url, fit: MAX_SIGNATURE_SIZE, margin: [0, 0, 0, 2] },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.8, lineColor: "#374151" }] },
        ],
      })),
    });
  }

  return {
    info: {
      title: input.title,
      author: PRODUCT_NAME,
      creator: PRODUCT_NAME,
      subject: `Report ${verification.reference}`,
      keywords: verification.reference,
      creationDate: input.generatedAt,
    },
    pageSize: "A4",
    pageOrientation: landscape ? "landscape" : "portrait",
    pageMargins: [MARGIN, topMargin, MARGIN, BOTTOM_MARGIN],
    header,
    footer,
    ...(branding.watermarkText ? { watermark: { text: branding.watermarkText, color: "#6b7280", opacity: 0.1, bold: true } } : {}),
    defaultStyle: { font: "Roboto", fontSize: TABLE_FONT_SIZE },
    styles: {
      title: { fontSize: 15, bold: true, margin: [0, 0, 0, 2] },
      h2: { fontSize: 11, bold: true },
      th: { bold: true, fontSize: TABLE_FONT_SIZE },
    },
    content,
  };
}

/** Renders the report to PDF bytes. */
export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  ensurePdfmakeConfigured();
  return pdfmake.createPdf(buildReportDocDefinition(input)).getBuffer();
}
