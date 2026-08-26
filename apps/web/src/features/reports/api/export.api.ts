import type { ExportJobResponseDto, SignedUrlResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * `POST /reports/export`: CSV completes synchronously server-side
 * (`status: "DONE"`, `fileId` populated in the same response — confirmed by
 * reading `export-jobs.service.ts` directly). XLSX/PDF are queued-forever
 * placeholders with no worker to ever pick them up, so this slice only ever
 * sends `format: "CSV"`.
 *
 * `CreateExportJobDto.params` degrades to a generated, gapped
 * `Record<string, never>` (same reason as `execute.api.ts`'s own
 * `ExecuteReportRequestBody`) — mirrored here and cast at the boundary.
 */
interface CreateExportJobRequestBody {
  reportCode: string;
  params: Record<string, never>;
  format: "CSV" | "XLSX" | "PDF";
}

export async function createExportJob(
  reportCode: string,
  params: Record<string, unknown>,
  format: "CSV" | "XLSX" | "PDF",
): Promise<ExportJobResponseDto> {
  return unwrapApiResult<ExportJobResponseDto>(
    await apiClient.POST("/api/v1/reports/export", {
      body: { reportCode, params, format } as unknown as CreateExportJobRequestBody,
    }),
  );
}

/** Matches `FilesController.signedUrl`'s own default (`DEFAULT_SIGNED_URL_EXPIRY_SECONDS`, `files.controller.ts`). Self-contained, per-feature copy — same established convention as `features/expenses/api/attachments.api.ts`. */
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;

type SignedUrlExpiryPreset = "60" | "300" | "900" | "3600" | "86400";

export async function getReportFileSignedUrl(
  fileId: string,
  expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
): Promise<SignedUrlResponseDto> {
  return unwrapApiResult<SignedUrlResponseDto>(
    await apiClient.GET("/api/v1/files/{id}/signed-url", {
      params: { path: { id: fileId }, query: { expirySeconds: String(expirySeconds) as SignedUrlExpiryPreset } },
    }),
  );
}
