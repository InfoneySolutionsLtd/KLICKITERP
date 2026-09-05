"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import {
  useApproveExternalTransfer,
  usePostExternalTransfer,
  useRejectExternalTransfer,
  useSubmitExternalTransfer,
  type BankExternalTransferResponseDto,
} from "../hooks/use-external-transfers";

/**
 * P-35 (External Bank Transfer feature) — mirrors `transfer-status-actions.tsx`'s
 * exact shape and state machine (DRAFT -> direct-click submit,
 * PENDING_APPROVAL -> approve/reject behind confirm dialogs, APPROVED ->
 * post behind its own confirm dialog, POSTED terminal). Same 3-permission
 * split (`banking:external-transfer:create` on submit, `:decide` on
 * approve/reject, `:post` on post alone) and the same "never client-hide a
 * button on a guessed permission" discipline every status-actions component
 * in this codebase already follows.
 */
export function ExternalTransferStatusActions({ transfer }: { transfer: BankExternalTransferResponseDto }) {
  const t = useTranslations("banking.externalTransfers.statusActions");
  const tCommon = useTranslations("common");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [postOpen, setPostOpen] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);

  const submitMutation = useSubmitExternalTransfer();
  const approveMutation = useApproveExternalTransfer();
  const rejectMutation = useRejectExternalTransfer();
  const postMutation = usePostExternalTransfer();

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(transfer.id);
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
      await approveMutation.mutateAsync(transfer.id);
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
      await rejectMutation.mutateAsync(transfer.id);
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
      await postMutation.mutateAsync(transfer.id);
      setPostOpen(false);
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {transfer.status === "DRAFT" && (
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
          </Button>
        )}

        {transfer.status === "PENDING_APPROVAL" && (
          <>
            <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
              <DialogTrigger asChild>
                <Button type="button">{t("approveTrigger")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("approveConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("approveConfirmDescription", { number: transfer.number })}</DialogDescription>
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
                  <Button type="button" onClick={() => void handleApprove()} disabled={approveMutation.isPending}>
                    {approveMutation.isPending ? t("approving") : t("approveConfirmButton")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={rejectOpen} onOpenChange={handleRejectOpenChange}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline">
                  {t("rejectTrigger")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("rejectConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("rejectConfirmDescription", { number: transfer.number })}</DialogDescription>
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
                  <Button type="button" variant="destructive" onClick={() => void handleReject()} disabled={rejectMutation.isPending}>
                    {rejectMutation.isPending ? t("rejecting") : t("rejectConfirmButton")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        {transfer.status === "APPROVED" && (
          <Dialog open={postOpen} onOpenChange={handlePostOpenChange}>
            <DialogTrigger asChild>
              <Button type="button">{t("postTrigger")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("postConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("postConfirmDescription", { number: transfer.number })}</DialogDescription>
              </DialogHeader>
              <Alert variant="warning">
                <AlertDescription>{t("postJournalNote")}</AlertDescription>
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
