"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EXPENSE_VOUCHERS_QUERY_KEY } from "./use-vouchers";
import { getVoucherAttachmentSignedUrl, listVoucherAttachments, uploadVoucherAttachment } from "../api/attachments.api";

function attachmentsKey(voucherId: string | undefined) {
  return [...EXPENSE_VOUCHERS_QUERY_KEY, "attachments", voucherId] as const;
}

export function useVoucherAttachments(voucherId: string | undefined) {
  return useQuery({
    queryKey: attachmentsKey(voucherId),
    queryFn: () => listVoucherAttachments(voucherId as string),
    enabled: !!voucherId,
  });
}

/**
 * Invalidates only the attachments list — `VoucherResponseDto` has no
 * attachment-count/flag field, and BR-EXP-03 is only rechecked server-side
 * at the next submit attempt, so there's nothing on the voucher detail/list
 * queries (`use-vouchers.ts`) for a successful upload to change.
 */
export function useUploadVoucherAttachment(voucherId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadVoucherAttachment(voucherId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: attachmentsKey(voucherId) }),
  });
}

/**
 * Signed URLs are fetched lazily on click, not eagerly per row like
 * `features/billing/hooks/use-file-upload.ts`'s `useSignedUrl()` — a voucher
 * can have several attachments, and firing one signed-url request per row on
 * every page load is wasteful for a link that's only needed on click.
 */
export function useOpenVoucherAttachment() {
  return useMutation({
    mutationFn: (fileId: string) => getVoucherAttachmentSignedUrl(fileId),
  });
}
