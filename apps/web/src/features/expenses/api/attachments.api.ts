import type { FileObjectResponseDto, SignedUrlResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Expense voucher file attachments — the generic `FilesController`
 * (`packages/server/src/platform/files/api/files.controller.ts`), tagged
 * with `EXP_VOUCHER_FILE_ENTITY_TYPE` (a local mirror of the backend's own
 * `VouchersService.EXP_VOUCHER_FILE_ENTITY_TYPE` constant — not importable
 * across the app/server boundary). This is what
 * `VouchersService.assertAttachmentRequirement()` (BR-EXP-03) counts against,
 * so an upload here is what actually unblocks a voucher submit over the
 * configured KES threshold.
 *
 * Unlike `features/billing/api/files.api.ts`'s `uploadFile()` (which never
 * sends `entityId`, since a sponsor being created has no id yet),
 * `uploadVoucherAttachment()` sends BOTH `entityType` and `entityId` — the
 * voucher already has a real id by the time this screen renders.
 *
 * `GET /api/v1/files` takes `entityType`/`entityId` as REQUIRED, non-gapped
 * string query params (confirmed against the generated
 * `FilesController_list` operation type) — no `as unknown as X` cast needed
 * there, unlike the `POST` upload below.
 */
export const EXP_VOUCHER_FILE_ENTITY_TYPE = "exp_voucher";

/** Matches `FilesController.signedUrl`'s own default (`DEFAULT_SIGNED_URL_EXPIRY_SECONDS`, `files.controller.ts`). */
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;

export async function listVoucherAttachments(voucherId: string): Promise<FileObjectResponseDto[]> {
  return unwrapApiResult<FileObjectResponseDto[]>(
    await apiClient.GET("/api/v1/files", {
      params: { query: { entityType: EXP_VOUCHER_FILE_ENTITY_TYPE, entityId: voucherId } },
    }),
  );
}

interface UploadVoucherAttachmentRequestBody {
  file: string;
  entityType?: string;
  entityId?: string;
}

export async function uploadVoucherAttachment(voucherId: string, file: File): Promise<FileObjectResponseDto> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("entityType", EXP_VOUCHER_FILE_ENTITY_TYPE);
  formData.append("entityId", voucherId);
  return unwrapApiResult<FileObjectResponseDto>(
    await apiClient.POST("/api/v1/files", { body: formData as unknown as UploadVoucherAttachmentRequestBody }),
  );
}

/** Same closed preset-set narrowing as `features/billing/api/files.api.ts`'s own copy — `SIGNED_URL_EXPIRY_PRESETS_SECONDS` server-side. */
type SignedUrlExpiryPreset = "60" | "300" | "900" | "3600" | "86400";

export async function getVoucherAttachmentSignedUrl(
  fileId: string,
  expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
): Promise<SignedUrlResponseDto> {
  return unwrapApiResult<SignedUrlResponseDto>(
    await apiClient.GET("/api/v1/files/{id}/signed-url", {
      params: {
        path: { id: fileId },
        query: { expirySeconds: String(expirySeconds) as SignedUrlExpiryPreset },
      },
    }),
  );
}
