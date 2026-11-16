import { EntityManager } from "typeorm";
import { ExportJobsService } from "../application/export-jobs.service";
import { ReportDefinition, ReportRegistryService } from "../application/report-registry.service";
import { RptExportJobRepository } from "../infrastructure/rpt-export-job.repository";
import { RptExportJobEntity } from "../domain/rpt-export-job.entity";
import { Money } from "../../../shared/money/money";
import type { FilesService } from "../../../platform/files";
import type { ReportPdfService } from "../application/pdf/report-pdf.service";

const FAKE_REPORT: ReportDefinition<{ fromDate: string }> = {
  code: "fake-report",
  name: "Fake Report",
  domain: "test",
  permissionCode: "reports:fake-report:view",
  paramsShape: { fromDate: "date" },
  columns: [
    { key: "label", label: "Label", type: "string" },
    { key: "amount", label: "Amount", type: "money" },
  ],
  execute: jest.fn(async () => ({
    rows: [{ label: "Row 1", amount: Money.fromInt(100) }],
    totals: { total: Money.fromInt(100) },
    generatedAt: new Date(),
  })),
};

describe("ExportJobsService", () => {
  let registry: ReportRegistryService;
  let exportJobRepository: { create: jest.Mock; save: jest.Mock };
  let filesService: { upload: jest.Mock };
  let reportPdfService: { generate: jest.Mock };
  let service: ExportJobsService;
  const em = {} as EntityManager;

  beforeEach(() => {
    registry = new ReportRegistryService();
    registry.register(FAKE_REPORT);
    exportJobRepository = {
      create: jest.fn(async (data: Partial<RptExportJobEntity>) => ({ id: "job-1", ...data }) as RptExportJobEntity),
      save: jest.fn(async (entity: RptExportJobEntity) => entity),
    };
    filesService = { upload: jest.fn(async () => ({ id: "file-1" })) };
    reportPdfService = { generate: jest.fn(async () => Buffer.from("%PDF-1.7 fake")) };
    service = new ExportJobsService(
      registry,
      exportJobRepository as unknown as RptExportJobRepository,
      filesService as unknown as FilesService,
      reportPdfService as unknown as ReportPdfService,
    );
  });

  it("CSV format: executes the report, uploads a real CSV file, and marks the job DONE with the uploaded fileId", async () => {
    const job = await service.createJob(em, {
      reportCode: "fake-report",
      params: { fromDate: "2026-01-01" },
      format: "CSV",
      requestedBy: "user-1",
    });

    expect(filesService.upload).toHaveBeenCalledTimes(1);
    const uploadArgs = filesService.upload.mock.calls[0][0];
    expect(uploadArgs.mime).toBe("text/csv");
    expect(uploadArgs.buffer.toString("utf8")).toContain("Row 1,100.0000");

    expect(job.status).toBe("DONE");
    expect(job.fileId).toBe("file-1");
    // format is threaded through params under __exportFormat (rpt_export_job has no dedicated format column)
    expect((job.params as Record<string, unknown>).__exportFormat).toBe("CSV");
  });

  it("CSV format never touches the PDF renderer (raw data export: no letterhead, no QR)", async () => {
    await service.createJob(em, { reportCode: "fake-report", params: {}, format: "CSV", requestedBy: "user-1" });
    expect(reportPdfService.generate).not.toHaveBeenCalled();
  });

  it("PDF format: renders the branded PDF, uploads it as application/pdf and marks the job DONE", async () => {
    const job = await service.createJob(em, {
      reportCode: "fake-report",
      params: { fromDate: "2026-01-01" },
      format: "PDF",
      requestedBy: "user-1",
    });

    expect(reportPdfService.generate).toHaveBeenCalledTimes(1);
    const [passedEm, generateArgs] = reportPdfService.generate.mock.calls[0];
    expect(passedEm).toBe(em); // the verification record is minted in THIS job's transaction
    expect(generateArgs).toMatchObject({
      definition: expect.objectContaining({ code: "fake-report" }),
      params: { fromDate: "2026-01-01" },
      jobId: "job-1",
      requestedBy: "user-1",
    });
    expect(generateArgs.result.rows).toHaveLength(1);

    expect(filesService.upload).toHaveBeenCalledTimes(1);
    const uploadArgs = filesService.upload.mock.calls[0][0];
    expect(uploadArgs.mime).toBe("application/pdf");
    expect(uploadArgs.originalName).toBe("fake-report-job-1.pdf");
    expect(uploadArgs.buffer.subarray(0, 5).toString()).toBe("%PDF-");

    expect(job.status).toBe("DONE");
    expect(job.fileId).toBe("file-1");
    expect((job.params as Record<string, unknown>).__exportFormat).toBe("PDF");
  });

  it("PDF format: a render failure (e.g. too many rows) marks the job FAILED, uploads nothing and rethrows", async () => {
    reportPdfService.generate.mockRejectedValueOnce(new Error("too many rows for a PDF"));

    await expect(
      service.createJob(em, { reportCode: "fake-report", params: {}, format: "PDF", requestedBy: "user-1" }),
    ).rejects.toThrow("too many rows for a PDF");

    expect(filesService.upload).not.toHaveBeenCalled();
    const savedCalls = exportJobRepository.save.mock.calls;
    expect(savedCalls[savedCalls.length - 1][0].status).toBe("FAILED");
  });

  it("XLSX format: stays QUEUED (deferred), and never renders or uploads anything", async () => {
    const job = await service.createJob(em, {
      reportCode: "fake-report",
      params: { fromDate: "2026-01-01" },
      format: "XLSX",
      requestedBy: "user-1",
    });

    expect(filesService.upload).not.toHaveBeenCalled();
    expect(reportPdfService.generate).not.toHaveBeenCalled();
    expect(job.status).toBe("QUEUED");
    expect(job.fileId).toBeNull();
  });

  it("marks the job FAILED and rethrows when report execution throws", async () => {
    const failingReport: ReportDefinition = { ...FAKE_REPORT, code: "failing-report", execute: jest.fn(async () => {
      throw new Error("boom");
    }) };
    registry.register(failingReport);

    await expect(
      service.createJob(em, { reportCode: "failing-report", params: {}, format: "CSV", requestedBy: "user-1" }),
    ).rejects.toThrow("boom");

    const savedCalls = exportJobRepository.save.mock.calls;
    expect(savedCalls[savedCalls.length - 1][0].status).toBe("FAILED");
  });

  it("throws when the report code is unknown", async () => {
    await expect(
      service.createJob(em, { reportCode: "does-not-exist", params: {}, format: "CSV", requestedBy: "user-1" }),
    ).rejects.toThrow();
  });
});
