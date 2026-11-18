/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ReceiptBrandingMissingException } from "../application/receipt-pdf/receipt-branding-missing.exception";
import { chooseVerificationBase, isPublicWebUrl, ReceiptPdfService } from "../application/receipt-pdf/receipt-pdf.service";
import { renderReceiptPdf } from "../application/receipt-pdf/receipt-pdf.renderer";

// Capture what would be printed instead of rendering real PDF bytes (the renderer has its own specs).
jest.mock("../application/receipt-pdf/receipt-pdf.renderer", () => ({ renderReceiptPdf: jest.fn(async () => Buffer.from("%PDF-1.7 fake")) }));

const RECEIPT = "00000000-0000-4000-8000-000000000001";
const ROW = { id: RECEIPT, student_id: "s1", number: "PAY-000042", date: "2026-03-10", total: "2500.0000", status: "POSTED", payer_name: "Wanjiru Kamau", reversal_of_id: null, first_name: "Amina", middle_name: null, last_name: "Kamau", admission_no: "ADM-1", class_name: "Grade 4" };
const LOGO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

interface Options {
  theme?: any;
  themeError?: Error;
  logoError?: Error;
  webAppUrl?: string;
  row?: any;
  ensureToken?: jest.Mock;
}

function harness(opts: Options = {}) {
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (/JOIN app\.std_student/.test(sql)) return opts.row === undefined ? [ROW] : opts.row ? [opts.row] : [];
      if (/pay_receipt_split/.test(sql)) return [{ method: "MPESA_STK", amount: "2500.0000", external_ref: "QWE123" }];
      if (/LEFT JOIN app\.bill_invoice i ON i\.id = a\.invoice_id/.test(sql)) return [{ amount: "2500.0000", to_prepayment: false, invoice_number: "INV-1" }];
      if (/sum\(balance\)/.test(sql)) return [{ total_balance: "0", open_count: 0 }];
      return [];
    }),
  };
  const themes = {
    getCurrentTheme: jest.fn(async () => {
      if (opts.themeError) throw opts.themeError;
      return opts.theme ?? { logoFileId: "logo-file", documentConfig: { headerText: "Sunrise Academy", footerText: "Thanks" } };
    }),
  };
  const files = {
    read: jest.fn(async () => {
      if (opts.logoError) throw opts.logoError;
      return { buffer: LOGO };
    }),
  };
  const ensureToken = opts.ensureToken ?? jest.fn(async () => ({ token: "tok123" }));
  const config = { webAppUrl: opts.webAppUrl ?? "https://erp.school.example" };
  const service = new ReceiptPdfService(dataSource as any, themes as any, files as any, { ensureToken } as any, config as any);
  return { service, ensureToken };
}

const lastRendered = () => (renderReceiptPdf as jest.Mock).mock.calls.at(-1)?.[0];
beforeEach(() => (renderReceiptPdf as jest.Mock).mockClear());

describe("isPublicWebUrl / chooseVerificationBase — a QR code a parent's phone can open", () => {
  it.each([
    ["https://erp.school.example", true],
    ["https://erp.school.example/", true],
    ["http://10.0.0.5:3002", true],
    ["http://localhost:3002", false],
    ["http://127.0.0.1:3002", false],
    ["localhost", false],
    ["http://[::1]:3002", false],
    ["http://0.0.0.0", false],
    ["", false],
    [undefined, false],
    ["   ", false],
  ])("%s -> %s", (url, expected) => {
    expect(isPublicWebUrl(url as string | undefined)).toBe(expected);
  });

  it("uses the configured address when it is public (trailing slash dropped)", () => {
    expect(chooseVerificationBase("https://erp.school.example/", "https://other.example")).toEqual({ base: "https://erp.school.example", source: "configured" });
  });
  it("falls back to the address the ERP registered with the Academy when WEB_APP_URL is localhost or unset", () => {
    expect(chooseVerificationBase("http://localhost:3002", "https://erp.school.example")).toEqual({ base: "https://erp.school.example", source: "registered_address" });
    expect(chooseVerificationBase("", "https://erp.school.example/")).toEqual({ base: "https://erp.school.example", source: "registered_address" });
  });
  it("says so when there is no public address at all, and still returns the configured one as the best available", () => {
    expect(chooseVerificationBase("http://localhost:3002", null)).toEqual({ base: "http://localhost:3002", source: "not_public" });
    expect(chooseVerificationBase("http://localhost:3002", "http://127.0.0.1:3000")).toEqual({ base: "http://localhost:3002", source: "not_public" });
  });
});

describe("ReceiptPdfService.render — every receipt carries a QR code", () => {
  it("prints the verification QR address for a receipt, with its token", async () => {
    const h = harness();
    await h.service.render(RECEIPT);
    expect(h.ensureToken).toHaveBeenCalledWith(RECEIPT);
    expect(lastRendered().verification).toEqual({ url: "https://erp.school.example/verify/tok123", reference: "PAY-000042" });
  });

  it("ALWAYS has a QR: a receipt that had no token gets one first (the PDF never goes out without)", async () => {
    const h = harness({ ensureToken: jest.fn(async () => ({ token: "freshly-minted" })) });
    await h.service.render(RECEIPT);
    expect(lastRendered().verification.url).toBe("https://erp.school.example/verify/freshly-minted");
  });

  it("if a token cannot be made the request FAILS rather than handing out a receipt that cannot be verified", async () => {
    const h = harness({ ensureToken: jest.fn(async () => { throw new Error("db down"); }) });
    await expect(h.service.render(RECEIPT)).rejects.toThrow("db down");
    expect(renderReceiptPdf).not.toHaveBeenCalled();
  });

  it("uses the ERP's registered public address when WEB_APP_URL is localhost", async () => {
    const h = harness({ webAppUrl: "http://localhost:3002" });
    await h.service.render(RECEIPT, { fallbackWebUrl: "https://erp.klickiteducation.com" });
    expect(lastRendered().verification.url).toBe("https://erp.klickiteducation.com/verify/tok123");
  });

  it("a reversal's contra-receipt and a receipt that does not exist are the same not-found", async () => {
    await expect(harness({ row: { ...ROW, reversal_of_id: "orig" } }).service.render(RECEIPT)).rejects.toBeInstanceOf(NotFoundException);
    await expect(harness({ row: null }).service.render(RECEIPT)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ReceiptPdfService.render — a receipt is never issued anonymously", () => {
  it("prints the school's logo AND letterhead when both are set up", async () => {
    await harness().service.render(RECEIPT);
    expect(lastRendered().branding).toEqual({ logo: LOGO, headerText: "Sunrise Academy", footerText: "Thanks" });
  });

  it("refuses when the school has set up neither a logo nor letterhead text, and says what to do", async () => {
    const h = harness({ theme: { logoFileId: null, documentConfig: {} } });
    const error = await h.service.render(RECEIPT).catch((e) => e);
    expect(error).toBeInstanceOf(ReceiptBrandingMissingException);
    expect(error.code).toBe("RECEIPT_BRANDING_MISSING");
    expect(error.httpStatus).toBe(409);
    expect(error.message).toMatch(/Branding -> Documents/);
    expect(renderReceiptPdf).not.toHaveBeenCalled();
  });

  it("refuses when the branding cannot be loaded at all (nothing identifies the school)", async () => {
    await expect(harness({ themeError: new Error("db down") }).service.render(RECEIPT)).rejects.toBeInstanceOf(ReceiptBrandingMissingException);
  });

  it("refuses when the only branding is a logo file that cannot be read and there is no letterhead text", async () => {
    await expect(harness({ theme: { logoFileId: "gone", documentConfig: {} }, logoError: new Error("missing") }).service.render(RECEIPT)).rejects.toBeInstanceOf(ReceiptBrandingMissingException);
  });

  it("still issues it with letterhead text alone (the school is named), or a logo alone (the school is shown)", async () => {
    await harness({ theme: { logoFileId: null, documentConfig: { headerText: "Sunrise Academy" } } }).service.render(RECEIPT);
    expect(lastRendered().branding).toMatchObject({ logo: null, headerText: "Sunrise Academy" });
    await harness({ theme: { logoFileId: "logo-file", documentConfig: {} } }).service.render(RECEIPT);
    expect(lastRendered().branding).toMatchObject({ logo: LOGO, headerText: null });
  });

  it("an unreadable logo does not stop a receipt that still has letterhead text", async () => {
    await harness({ logoError: new Error("storage hiccup") }).service.render(RECEIPT);
    expect(lastRendered().branding).toMatchObject({ logo: null, headerText: "Sunrise Academy" });
  });
});

describe("ReceiptPdfService.readiness — what the school still has to set up", () => {
  it("complete when logo, letterhead text and a public QR address are all in place", async () => {
    expect(await harness().service.readiness()).toEqual({ canIssue: true, complete: true, issues: [] });
  });

  it("lists exactly what is missing", async () => {
    const h = harness({ theme: { logoFileId: null, documentConfig: {} }, webAppUrl: "http://localhost:3002" });
    expect(await h.service.readiness()).toEqual({ canIssue: false, complete: false, issues: ["NO_LOGO", "NO_LETTERHEAD", "QR_ADDRESS_NOT_PUBLIC"] });
  });

  it("can issue with just one of logo / letterhead, but is not complete", async () => {
    const h = harness({ theme: { logoFileId: "logo-file", documentConfig: {} } });
    expect(await h.service.readiness()).toEqual({ canIssue: true, complete: false, issues: ["NO_LETTERHEAD"] });
  });

  it("a registered public address counts as a usable QR address", async () => {
    const h = harness({ webAppUrl: "http://localhost:3002" });
    expect(await h.service.readiness({ fallbackWebUrl: "https://erp.school.example" })).toEqual({ canIssue: true, complete: true, issues: [] });
  });
});
