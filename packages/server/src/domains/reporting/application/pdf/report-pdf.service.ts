import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { DocumentVerificationService } from "../../../../platform/document-verification";
import { AppConfigService } from "../../../../shared/config/app-config.service";
import { ValidationException } from "../../../../shared/exceptions/validation.exception";
import type { ReportDefinition, ReportResult } from "../report-registry.service";
import { computeReportFingerprint } from "./report-fingerprint";
import { ReportBrandingService } from "./report-branding.service";
import { ReportParamLabelsService } from "./report-param-labels.service";
import { renderReportPdf } from "./report-pdf.renderer";

/** `docv_record.document_type` a generated report is minted under (free-text tag, like `PAYMENT_RECEIPT`). */
export const REPORT_DOCUMENT_TYPE = "REPORT";

/**
 * Most rows a PDF will contain. PDFs are rendered synchronously in the API process and a table
 * this size is already a long document; beyond it the export is refused with a pointer to CSV
 * (raw, streamable, and what spreadsheets want for that volume anyway) rather than tying up the API.
 * Matches the 10k-row threshold FR-RPT-005.1 already names for "too big to do inline".
 */
export const PDF_MAX_ROWS = 10_000;

export interface GenerateReportPdfInput {
  definition: ReportDefinition<unknown>;
  params: Record<string, unknown>;
  result: ReportResult;
  /** The `rpt_export_job` id — also the verification record's `document_id`. */
  jobId: string;
  requestedBy: string;
}

/**
 * Produces one branded, verifiable PDF for an already-executed report (FR-RPT-003.1):
 * letterhead / footer / watermark / signatures from the Branding page, readable parameters,
 * a generation stamp, and a QR code that opens the public verification page.
 *
 * The verification record is minted inside the caller's own transaction (`em`), exactly as
 * `ReceiptsService.captureReceipt()` does, so a token can never exist for a PDF whose job
 * did not commit. Its public `summary` is deliberately METADATA ONLY — report name, reference,
 * when / by whom, row count and the data fingerprint — never a name, a parameter or a figure:
 * the verify page needs no login, so anyone holding a printout can read it.
 */
@Injectable()
export class ReportPdfService {
  private readonly logger = new Logger(ReportPdfService.name);

  constructor(
    private readonly brandingService: ReportBrandingService,
    private readonly paramLabels: ReportParamLabelsService,
    private readonly documentVerification: DocumentVerificationService,
    private readonly config: AppConfigService,
  ) {}

  async generate(em: EntityManager, input: GenerateReportPdfInput): Promise<Buffer> {
    const { definition, params, result, jobId, requestedBy } = input;

    if (result.rows.length > PDF_MAX_ROWS) {
      throw new ValidationException(
        `This report has ${result.rows.length.toLocaleString("en-US")} rows, which is too many for a PDF (limit ${PDF_MAX_ROWS.toLocaleString("en-US")}). Narrow the filters, or export it as CSV instead.`,
        { rowCount: result.rows.length, maxRows: PDF_MAX_ROWS },
      );
    }

    const fingerprint = computeReportFingerprint({ columns: definition.columns, rows: result.rows, totals: result.totals });
    const reference = `RPT-${jobId.replace(/-/g, "").slice(-8).toUpperCase()}`;

    const [branding, paramLines, generatedBy] = await Promise.all([
      this.brandingService.load(),
      this.paramLabels.describe(definition.paramsShape, params),
      this.paramLabels.userDisplayName(requestedBy),
    ]);

    const { token } = await this.documentVerification.mint(em, {
      documentType: REPORT_DOCUMENT_TYPE,
      documentId: jobId,
      documentRef: reference,
      summary: {
        reportName: definition.name,
        generatedAt: result.generatedAt.toISOString(),
        generatedBy,
        rowCount: result.rows.length,
        fingerprint,
      },
    });

    return renderReportPdf({
      title: definition.name,
      columns: definition.columns,
      rows: result.rows,
      totals: result.totals,
      paramLines,
      branding,
      generatedAt: result.generatedAt,
      generatedBy,
      verification: { url: this.verificationUrl(token), reference, fingerprint },
    });
  }

  /**
   * `<WEB_APP_URL>/verify/<token>`. The browser-side QR on receipts uses `window.location.origin`;
   * a server-rendered PDF has no browser, so it relies on `WEB_APP_URL` being the school's real
   * public address. The localhost default would print QR codes nobody can open — warn loudly.
   */
  private verificationUrl(token: string): string {
    const base = this.config.webAppUrl.replace(/\/+$/, "");
    if (this.config.nodeEnv === "production" && /localhost|127\.0\.0\.1/.test(base)) {
      this.logger.warn(
        `WEB_APP_URL is "${base}" in production — the QR codes on exported reports will point at it and cannot be opened. Set WEB_APP_URL to the school's public address.`,
      );
    }
    return `${base}/verify/${token}`;
  }
}
