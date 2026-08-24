"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { CreditNoteResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useDecideCreditNote, usePostCreditNote, useSubmitCreditNote } from "../hooks/use-credit-notes";

/**
 * Phase 6 Slice 22 Part 5 — mirrors `payment-voucher-status-actions.tsx`'s
 * exact shape (one `Dialog` per action, each with its own local open/error
 * state), the template the plan names for a 4-state lifecycle.
 * `BillCreditNoteEntity`'s real lifecycle (`credit-notes.service.ts`'s own
 * class doc comment) is `DRAFT -> PENDING_APPROVAL -> APPROVED -> POSTED`,
 * with NO real REJECTED terminal state:
 * `onApprovalDecided(approved=false)` reverts the note straight back to
 * DRAFT (`BillNoteStatus` has no REJECTED value — the same documented gap
 * Late Fee Batches' own decide() has). The Reject dialog's copy below says
 * plainly that it sends the note back to Draft to be resubmitted, rather
 * than implying a permanent rejection.
 *
 * `usePostCreditNote(invoiceId, studentId)` — its own doc comment
 * (`use-credit-notes.ts`) documents the real invoice-side effect this
 * confirm dialog's `postInvoiceEffectNote` puts in front of the user:
 * `post()` directly reduces the target invoice's own `paidAmount`/`balance`.
 */
export function CreditNoteStatusActions({
  note,
  invoiceId,
  studentId,
}: {
  note: CreditNoteResponseDto;
  invoiceId: string;
  studentId: string | undefined;
}) {
  const t = useTranslations("billing.creditNotes.statusActions");
  const tCommon = useTranslations("common");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [postOpen, setPostOpen] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);

  const submitMutation = useSubmitCreditNote(invoiceId);
  const decideMutation = useDecideCreditNote(invoiceId);
  const postMutation = usePostCreditNote(invoiceId, studentId);

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(note.id);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleApproveOpenChange(next: boolean) {
    setApproveOpen(next);
    if (next) setApproveError(null);
  }

  async function handleApprove() {
    setApproveError(null);
    try {
      await decideMutation.mutateAsync({ id: note.id, dto: { approved: true } });
      setApproveOpen(false);
    } catch (err) {
      setApproveError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleRejectOpenChange(next: boolean) {
    setRejectOpen(next);
    if (next) setRejectError(null);
  }

  async function handleReject() {
    setRejectError(null);
    try {
      await decideMutation.mutateAsync({ id: note.id, dto: { approved: false } });
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handlePostOpenChange(next: boolean) {
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {note.status === "DRAFT" && (
          <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
          </Button>
        )}

        {note.status === "PENDING_APPROVAL" && (
          <>
            <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
              <DialogTrigger asChild>
                <Button type="button" size="sm">
                  {t("approveTrigger")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("approveConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("approveConfirmDescription", { number: note.number })}</DialogDescription>
                </DialogHeader>
                {approveError && (
                  <Alert variant="destructive">
                    <AlertDescription>{approveError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setApproveOpen(false)}>
                    {tCommon("cancel")}
                  </Button>
                  <Button type="button" onClick={() => void handleApprove()} disabled={decideMutation.isPending}>
                    {decideMutation.isPending ? t("approving") : t("approveConfirmButton")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={rejectOpen} onOpenChange={handleRejectOpenChange}>
              <DialogTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  {t("rejectTrigger")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("rejectConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("rejectConfirmDescription", { number: note.number })}</DialogDescription>
                </DialogHeader>
                {rejectError && (
                  <Alert variant="destructive">
                    <AlertDescription>{rejectError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
                    {tCommon("cancel")}
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => void handleReject()} disabled={decideMutation.isPending}>
                    {decideMutation.isPending ? t("rejecting") : t("rejectConfirmButton")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        {note.status === "APPROVED" && (
          <Dialog open={postOpen} onOpenChange={handlePostOpenChange}>
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
        )}
      </div>

      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
