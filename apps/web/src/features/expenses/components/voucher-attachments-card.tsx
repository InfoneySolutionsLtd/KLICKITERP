"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useOpenVoucherAttachment, useUploadVoucherAttachment, useVoucherAttachments } from "../hooks/use-voucher-attachments";
import type { FileObjectResponseDto } from "@klickit/contracts";

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${BYTE_UNITS[unitIndex]}`;
}

function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString();
}

/**
 * The one real attachment surface for an expense voucher, unblocking
 * BR-EXP-03 (`VouchersService.assertAttachmentRequirement()`) — no such UI
 * existed anywhere in the app before this. Genuinely new shape (a real
 * multi-file list, not a single value/onChange picker like
 * `AgreementFilePicker`) since a voucher has its own real id upfront, so
 * `GET /api/v1/files?entityType=exp_voucher&entityId=` can list real,
 * already-uploaded attachments with real filenames.
 *
 * Always rendered, upload always enabled regardless of `voucher.status` —
 * nothing server-side restricts upload by status, and attaching supporting
 * docs after approval/payment is legitimate. No remove/delete affordance —
 * matches this codebase's established immutable-files, delete-and-reupload
 * convention (see `AgreementFilePicker`'s own doc comment).
 */
export function VoucherAttachmentsCard({ voucherId }: { voucherId: string }) {
  const t = useTranslations("expenses.vouchers.attachments");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const attachmentsQuery = useVoucherAttachments(voucherId);
  const uploadMutation = useUploadVoucherAttachment(voucherId);
  const openMutation = useOpenVoucherAttachment();
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [openingId, setOpeningId] = React.useState<string | null>(null);

  function openPicker() {
    if (uploadMutation.isPending) return;
    inputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    try {
      await uploadMutation.mutateAsync(file);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : t("uploadError"));
    }
  }

  async function handleOpen(file: FileObjectResponseDto) {
    setOpenError(null);
    setOpeningId(file.id);
    try {
      const signed = await openMutation.mutateAsync(file.id);
      window.open(signed.url, "_blank", "noreferrer");
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : t("openError"));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <div className="flex flex-col items-end gap-1">
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => void handleFileSelected(e)} />
          <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploadMutation.isPending ? t("uploading") : t("uploadTrigger")}
          </Button>
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <QueryBoundary query={attachmentsQuery}>
          {(files) => (
            <ul className="space-y-2">
              {files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30">
                    <FileText className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <p className="line-clamp-1 text-sm text-foreground">{file.originalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.sizeBytes)} · {formatDateTime(file.createdAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleOpen(file)}
                    disabled={openingId === file.id}
                  >
                    {openingId === file.id ? <Loader2 className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}
                    {t("openTrigger")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
        {openError && <p className="text-xs text-destructive">{openError}</p>}
      </CardContent>
    </Card>
  );
}
