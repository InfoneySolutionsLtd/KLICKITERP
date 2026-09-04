"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteFile, getFile, getFileSignedUrl, listFiles, type ListFilesParams } from "../api/files.api";

export const FILES_QUERY_KEY = ["files"] as const;

function listKey(params: ListFilesParams) {
  return [...FILES_QUERY_KEY, "list", params] as const;
}
function detailKey(id: string | undefined) {
  return [...FILES_QUERY_KEY, "detail", id] as const;
}

/** `files:file:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched. */
export function useFiles(params: ListFilesParams) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listFiles(params) });
}

export function useFile(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getFile(id as string), enabled: !!id });
}

/** A mutation, not a query — a signed URL is single-use-ish (short expiry) and opened immediately via `window.open()`, never cached/displayed, same shape `features/expenses/hooks/use-voucher-attachments.ts`'s own `useOpenVoucherAttachment()` establishes. */
export function useFileSignedUrl() {
  return useMutation({ mutationFn: (id: string) => getFileSignedUrl(id) });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFile(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FILES_QUERY_KEY }),
  });
}
