import { Logger } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { Money } from "../../../shared/money/money";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { computeReportFingerprint } from "../application/pdf/report-fingerprint";
import { PDF_MAX_ROWS, REPORT_DOCUMENT_TYPE, ReportPdfService } from "../application/pdf/report-pdf.service";
import { renderReportPdf } from "../application/pdf/report-pdf.renderer";
import type { ReportDefinition, ReportResult } from "../application/report-registry.service";

// The real renderer is covered by its own spec; here we only inspect what the service hands it.
jest.mock("../application/pdf/report-pdf.renderer", () => ({
  renderReportPdf: jest.fn(async () => Buffer.from("%PDF-1.7 fake")),
}));

const JOB_ID = "0190b2c4-aaaa-7bbb-8ccc-1234567890ab";
const em = { marker: "tx" } as unknown as EntityManager;

const DEFINITION: ReportDefinition<unknown> = {
  code: "student-statement",
  name: "Student Statement",
  domain: "students",
  permissionCode: "reports:student-statement:view",
  paramsShape: { studentId: "uuid" },
  columns: [
    { key: "doc", label: "Document No.", type: "string" },
    { key: "debit", label: "Debit", type: "money" },
  ],
  execute: jest.fn(),
};

function makeResult(rowCount = 2): ReportResult {
  return {
    rows: Array.from({ length: rowCount }, (_, i) => ({ doc: `BIL-${i}`, debit: Money.fromDecimalString("500") })),
    totals: { totalDebit: Money.fromDecimalString("1000") },
    generatedAt: new Date("2026-11-16T11:32:00.000Z"),
  };
}

describe("ReportPdfService", () => {
  let branding: { load: jest.Mock };
  let paramLabels: { describe: jest.Mock; userDisplayName: jest.Mock };
  let verification: { mint: jest.Mock };
  let config: { webAppUrl: string; nodeEnv: string };
  let service: ReportPdfService;
  const render = renderReportPdf as jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    render.mockClear();
    branding = { load: jest.fn(async () => ({ logo: null, headerText: "KLICKIT ACADEMY", footerText: null, watermarkText: null, signatures: [] })) };
    paramLabels = {
      describe: jest.fn(async () => [{ label: "Student", value: "Eric Mwangi (254)" }]),
      userDisplayName: jest.fn(async () => "John Havy"),
    };
    verification = { mint: jest.fn(async () => ({ token: "tok123" })) };
    config = { webAppUrl: "https://erp.klickiteducation.com", nodeEnv: "production" };
    service = new ReportPdfService(branding as never, paramLabels as never, verification as never, config as never);
  });

  afterEach(() => jest.restoreAllMocks());

  const generate = (result = makeResult()) =>
    service.generate(em, { definition: DEFINITION, params: { studentId: "s-uuid" }, result, jobId: JOB_ID, requestedBy: "user-1" });

  it("renders the report and returns the PDF bytes", async () => {
    const pdf = await generate();
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("hands the renderer the report data, readable parameters, branding, who/when, and the verification link", async () => {
    await generate();

    const input = render.mock.calls[0][0];
    expect(input.title).toBe("Student Statement");
    expect(input.columns).toBe(DEFINITION.columns);
    expect(input.rows).toHaveLength(2);
    expect(input.paramLines).toEqual([{ label: "Student", value: "Eric Mwangi (254)" }]);
    expect(input.branding.headerText).toBe("KLICKIT ACADEMY");
    expect(input.generatedBy).toBe("John Havy");
    expect(input.generatedAt).toEqual(new Date("2026-11-16T11:32:00.000Z"));
    expect(input.verification.url).toBe("https://erp.klickiteducation.com/verify/tok123");
    expect(input.verification.reference).toBe("RPT-567890AB"); // last 8 hex of the job id
    expect(input.verification.fingerprint).toBe(
      computeReportFingerprint({ columns: DEFINITION.columns, rows: makeResult().rows, totals: makeResult().totals }),
    );
  });

  it("mints the verification record inside the caller's transaction, under the REPORT type, keyed by the job", async () => {
    await generate();

    expect(verification.mint).toHaveBeenCalledTimes(1);
    const [mintEm, mintInput] = verification.mint.mock.calls[0];
    expect(mintEm).toBe(em);
    expect(mintInput).toMatchObject({ documentType: REPORT_DOCUMENT_TYPE, documentId: JOB_ID, documentRef: "RPT-567890AB" });
  });

  it("the PUBLIC verification summary is metadata only — no parameters, names, rows or figures (the verify page needs no login)", async () => {
    await generate();

    const { summary } = verification.mint.mock.calls[0][1];
    expect(Object.keys(summary).sort()).toEqual(["fingerprint", "generatedAt", "generatedBy", "reportName", "rowCount"]);
    expect(summary).toMatchObject({
      reportName: "Student Statement",
      generatedAt: "2026-11-16T11:32:00.000Z",
      generatedBy: "John Havy",
      rowCount: 2,
    });
    expect(summary.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const published = JSON.stringify(summary);
    expect(published).not.toContain("Eric Mwangi");
    expect(published).not.toContain("s-uuid");
    expect(published).not.toContain("500");
    expect(published).not.toContain("BIL-");
  });

  it("tolerates a trailing slash on WEB_APP_URL", async () => {
    config.webAppUrl = "https://erp.klickiteducation.com///";
    await generate();
    expect(render.mock.calls[0][0].verification.url).toBe("https://erp.klickiteducation.com/verify/tok123");
  });

  it("warns loudly in production when WEB_APP_URL is still the localhost default (the QR codes would be unusable)", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    config.webAppUrl = "http://localhost:3002";

    await generate();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("WEB_APP_URL"));
  });

  it("does not warn about localhost outside production, or for a real production address", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    config.webAppUrl = "http://localhost:3002";
    config.nodeEnv = "development";
    await generate();
    config.webAppUrl = "https://erp.klickiteducation.com";
    config.nodeEnv = "production";
    await generate();

    expect(warn).not.toHaveBeenCalled();
  });

  it("prints no 'generated by' when the user can't be resolved", async () => {
    paramLabels.userDisplayName.mockResolvedValue(null);
    await generate();
    expect(render.mock.calls[0][0].generatedBy).toBeNull();
  });

  describe("row cap", () => {
    it("refuses a report over the limit with a message pointing at CSV — before minting or rendering anything", async () => {
      const tooBig = makeResult(PDF_MAX_ROWS + 1);

      const error = await generate(tooBig).catch((e: Error) => e);

      expect(error).toBeInstanceOf(ValidationException);
      expect((error as Error).message).toContain("CSV");
      expect((error as Error).message).toContain("10,001");
      expect(verification.mint).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
    });

    it("accepts a report exactly at the limit", async () => {
      await expect(generate(makeResult(PDF_MAX_ROWS))).resolves.toBeDefined();
    });
  });
});
