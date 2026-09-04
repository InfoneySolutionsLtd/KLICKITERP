import type { FileListResponseDto, FileObjectResponseDto, SignedUrlResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `FilesController`
 * (`packages/server/src/platform/files/api/files.controller.ts`).
 * `files:file:view` covers list/get/signed-url, `files:file:delete` covers
 * delete — no dedicated "browse everything" permission exists (a deliberate
 * choice: this RBAC system has no row/entity-instance scoping anywhere,
 * `files:file:view` is already a flat, global grant, so a browse screen
 * isn't a new capability, just removing the need to already know which
 * entityType/entityId to ask for — see `files.controller.ts`'s own doc
 * comment on `list()`).
 */
export interface ListFilesParams {
  entityType?: string;
  entityId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listFiles(params: ListFilesParams = {}): Promise<FileListResponseDto> {
  return unwrapApiResult<FileListResponseDto>(
    await apiClient.GET("/api/v1/files", {
      params: {
        query: {
          ...(params.entityType ? { entityType: params.entityType } : {}),
          ...(params.entityId ? { entityId: params.entityId } : {}),
          ...(params.q ? { q: params.q } : {}),
          ...(params.page !== undefined ? { page: params.page } : {}),
          ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
        },
      },
    }),
  );
}

export async function getFile(id: string): Promise<FileObjectResponseDto> {
  return unwrapApiResult<FileObjectResponseDto>(await apiClient.GET("/api/v1/files/{id}", { params: { path: { id } } }));
}

/** Matches `FilesController.signedUrl`'s own default (`DEFAULT_SIGNED_URL_EXPIRY_SECONDS`, `files.controller.ts`). */
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;

/** `SignedUrlQueryDto.expirySeconds` is a genuinely closed preset set server-side, and the generated query-param type correctly reflects it as a literal union (no codegen gap here) — same cast every other `getSignedUrl`-shaped wrapper in this codebase already uses (e.g. `features/expenses/api/attachments.api.ts`). */
type SignedUrlExpiryPreset = "60" | "300" | "900" | "3600" | "86400";

export async function getFileSignedUrl(
  id: string,
  expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
): Promise<SignedUrlResponseDto> {
  return unwrapApiResult<SignedUrlResponseDto>(
    await apiClient.GET("/api/v1/files/{id}/signed-url", {
      params: { path: { id }, query: { expirySeconds: String(expirySeconds) as SignedUrlExpiryPreset } },
    }),
  );
}

export async function deleteFile(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/files/{id}", { params: { path: { id } } });
  unwrapApiResult<{ deleted: true }>(result);
}
