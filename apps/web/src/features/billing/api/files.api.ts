import type { FileObjectResponseDto, SignedUrlResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Part 1 (Billing sub-features batch) — a SELF-CONTAINED copy of Branding's
 * generic file-upload plumbing (`features/branding/api/files.api.ts`), for
 * `SponsorDialog`'s `agreementFileId` field. Same generic backend route
 * (`FilesController`, `packages/server/src/platform/files/api/files.controller.ts`)
 * as Branding's own copy, just tagged with this module's own
 * `entityType` ("BILL_SPONSOR_AGREEMENT" — a free-text field server-side,
 * `UploadFileFieldsDto.entityType`, not a real FK/enum) instead of
 * Branding's "BRND_THEME". Duplicated rather than imported cross-feature,
 * matching `query-params.ts`'s own doc comment: "every future module should
 * do the same rather than reach across feature boundaries" for this
 * monorepo's `features/<module>/{api,hooks,components}` self-containment
 * convention.
 *
 * `entityId` is never sent — a sponsor being created in this form has no id
 * yet at picker-interaction time, and the field is genuinely optional
 * server-side.
 *
 * Same `as unknown as X` codegen-gap cast Branding's own copy establishes:
 * `openapi-fetch`'s `defaultBodySerializer` passes a real `FormData`
 * instance through untouched, but the generated request-body type for
 * `POST /api/v1/files` (a plain `{file, entityType, entityId}` object shape
 * — NestJS/Swagger can't reflect a raw multipart body into anything more
 * specific) doesn't structurally match `FormData`.
 */
export const BILL_SPONSOR_AGREEMENT_ENTITY_TYPE = "BILL_SPONSOR_AGREEMENT";

/** Matches `FilesController.signedUrl`'s own default (`DEFAULT_SIGNED_URL_EXPIRY_SECONDS`, `files.controller.ts`). */
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;

export interface UploadFileRequestBody {
  file: string;
  entityType?: string;
}

export async function uploadFile(file: File, entityType: string): Promise<FileObjectResponseDto> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("entityType", entityType);
  return unwrapApiResult<FileObjectResponseDto>(
    await apiClient.POST("/api/v1/files", { body: formData as unknown as UploadFileRequestBody }),
  );
}

/** Same closed preset-set narrowing as Branding's own copy — `SIGNED_URL_EXPIRY_PRESETS_SECONDS` server-side. */
type SignedUrlExpiryPreset = "60" | "300" | "900" | "3600" | "86400";

export async function getSignedUrl(
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
