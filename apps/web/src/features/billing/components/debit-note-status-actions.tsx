"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { DebitNoteResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { usePostDebitNote } from "../hooks/use-debit-notes";

/**
 * Phase 6 Slice 22 Part 5 — much smaller than `CreditNoteStatusActions`:
 * `DebitNotesController` has NO submit/decide routes at all (confirmed by
 * reading it — `debit-notes.api.ts`'s own doc comment already documents this
 * exact gap), so `BillDebitNoteEntity` only ever moves `DRAFT -> POSTED`
 * directly, one confirm dialog, no approve/reject pair.
 *
 * The confirm dialog's copy states plainly this is NOT a lightweight
 * adjustment: `DebitNotesService.post()` (see that class's own "Design
 * decision" doc comment) literally generates and posts a real new invoice
 * under the hood (`InvoicingService.generateInvoice()` with
 * `source: 'DEBIT_NOTE'`, then `.postInvoice()`), carrying the exact same
 * conflict risks (e.g. BR-BILL-04) any other invoice post does.
 */
export function DebitNoteStatusActions({ note, studentId }: { note: DebitNoteResponseDto; studentId: string | undefined }) {
  const t = useTranslations("billing.debitNotes.statusActions");
  const tCommon = useTranslations("common");
  const [postOpen, setPostOpen] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);

  const postMutation = usePostDebitNote(studentId);

  function handleOpenChange(next: boolean) {
    setPostOpen(next);
    if (next) setPostError(null);
  }

  async function handlePost() {
    setPostError(null);
    try {
      await postMutation.mutateAsync(note.id);
      setPostOpen(false);
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (note.status !== "DRAFT") return null;

  return (
    <Dialog open={postOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          {t("postTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("postConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("postConfirmDescription", { number: note.number })}</DialogDescription>
        </DialogHeader>
        <Alert variant="warning">
          <AlertDescription>{t("postInvoiceEffectNote")}</AlertDescription>
        </Alert>
        {postError && (
          <Alert variant="destructive">
            <AlertDescription>{postError}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPostOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handlePost()} disabled={postMutation.isPending}>
            {postMutation.isPending ? t("posting") : t("postConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
