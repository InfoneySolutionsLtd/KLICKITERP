"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { getSignedUrl, uploadFile, DEFAULT_SIGNED_URL_EXPIRY_SECONDS } from "../api/files.api";

/**
 * Part 1 (Billing sub-features batch) — a self-contained copy of Branding's
 * `use-file-upload.ts` (see `files.api.ts`'s own doc comment for why this
 * isn't a cross-feature import). No cache invalidation — an uploaded
 * `file_object` has no list/detail query anywhere in this module to
 * invalidate; `AgreementFilePicker` reads the mutation's own returned
 * `FileObjectResponseDto` directly off `mutateAsync`'s resolved value.
 */
export function useUploadFile() {
  return useMutation({
    mutationFn: ({ file, entityType }: { file: File; entityType: string }) => uploadFile(file, entityType),
  });
}

/** `enabled: !!fileId` — only fetch once a real id exists. Refetches per `fileId`/`expirySeconds` pair since a signed URL actually expires. */
export function useSignedUrl(fileId: string | null, expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS) {
  return useQuery({
    queryKey: ["billing", "files", "signed-url", fileId, expirySeconds] as const,
    queryFn: () => getSignedUrl(fileId as string, expirySeconds),
    enabled: !!fileId,
  });
}
