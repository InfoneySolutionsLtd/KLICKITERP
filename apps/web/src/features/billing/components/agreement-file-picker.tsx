"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useSignedUrl, useUploadFile } from "../hooks/use-file-upload";
import { BILL_SPONSOR_AGREEMENT_ENTITY_TYPE } from "../api/files.api";

export interface AgreementFilePickerProps {
  label: string;
  value: string | null;
  onChange: (fileId: string | null) => void;
  disabled?: boolean;
}

/**
 * Part 1 (Billing sub-features batch) — a document-style sibling of
 * Branding's `<FilePicker>` (`features/branding/components/file-picker.tsx`),
 * for `SponsorDialog`'s `agreementFileId` field. That component renders an
 * `<img>` thumbnail preview — the wrong shape for a PDF/document agreement,
 * which can't be thumbnailed the same way — so this shows a filename + an
 * "open in new tab" link off the same signed-URL mechanism instead, built on
 * this module's own self-contained `use-file-upload.ts` copy.
 *
 * `entityType` is hardcoded to `BILL_SPONSOR_AGREEMENT_ENTITY_TYPE` — the
 * only caller today. `entityId` is never sent (same reasoning as Branding's
 * own copy: a sponsor being created has no id yet at picker-interaction
 * time).
 *
 * **The real filename is only ever known right after a fresh upload** —
 * `FileObjectResponseDto.originalName` comes back on the upload mutation's
 * own response, but there is no `GET /files/:id` metadata-by-id route on the
 * real `FilesController` (confirmed by reading it directly — only
 * `POST /`, `GET /` scoped to a REQUIRED `entityType`+`entityId` pair, and
 * `GET /:id/signed-url` exist), so re-opening an existing sponsor whose
 * agreement was uploaded in a previous session has no way to recover the
 * original filename here. A generic `documentLabel` is shown in that case
 * instead of a guessed/blank name — honest about the real gap rather than
 * silently wrong.
 *
 * **Remove never calls `DELETE /files/:id`** — same documented tradeoff as
 * Branding's own copy (files are immutable/delete-and-reupload by design;
 * this widget only clears the local reference).
 */
export function AgreementFilePicker({ label, value, onChange, disabled }: AgreementFilePickerProps) {
  const t = useTranslations("billing.common.agreementFilePicker");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadFile();
  const signedUrlQuery = useSignedUrl(value);
  const [error, setError] = React.useState<string | null>(null);
  const [uploadedName, setUploadedName] = React.useState<string | null>(null);

  function openPicker() {
    if (disabled || uploadMutation.isPending) return;
    inputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file) return;
    setError(null);
    try {
      const created = await uploadMutation.mutateAsync({ file, entityType: BILL_SPONSOR_AGREEMENT_ENTITY_TYPE });
      setUploadedName(created.originalName);
      onChange(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("uploadError"));
    }
  }

  function handleRemove() {
    setUploadedName(null);
    onChange(null);
  }

  const busy = uploadMutation.isPending;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => void handleFileSelected(e)} disabled={disabled} />

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30">
            <FileText className="size-4 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="line-clamp-1 text-sm text-foreground">{uploadedName ?? t("documentLabel")}</p>
            {signedUrlQuery.isPending ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                {t("loadingPreview")}
              </span>
            ) : signedUrlQuery.isError ? (
              <span className="text-xs text-muted-foreground">{t("previewError")}</span>
            ) : (
              <a
                href={signedUrlQuery.data?.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                {t("openInNewTab")}
              </a>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={disabled || busy}>
              {busy ? t("uploading") : t("replace")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleRemove} disabled={disabled || busy}>
              <X className="size-4" />
              {t("remove")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || busy}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-tint-primary">
            {busy ? <Loader2 className="size-5 animate-spin text-primary" /> : <Upload className="size-5 text-primary" />}
          </span>
          <span className="text-sm font-medium text-foreground">{busy ? t("uploading") : t("upload")}</span>
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
