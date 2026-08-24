"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { LateFeeBatchResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { parseLateFeeBatchSummary } from "../api/late-fee-batches.api";
import { useDecideLateFeeBatch, usePostLateFeeBatch } from "../hooks/use-late-fee-batches";

/**
 * `BillLateFeeBatchStatus` has only 3 real values — `DRAFT`/`PENDING_APPROVAL`/
 * `POSTED`, confirmed by reading `LateFeeBatchesService`'s own doc comment
 * directly. There is no distinct `APPROVED`/`REJECTED` state, unlike
 * `BudgetStatus`'s own 4-value enum this component's shape is otherwise
 * mirrored from (`budget-status-actions.tsx`) — `onApprovalDecided(approved:
 * false)` reverts a `PENDING_APPROVAL` batch straight back to `DRAFT` (no
 * terminal "rejected" state exists at all), so this component's own decline
 * action is worded "Send back to Draft," never "Reject."
 *
 * A persisted, visible `DRAFT` batch can ONLY happen when `runBatch()`
 * computed a zero total (nothing overdue, or every computed charge was
 * zero) — confirmed directly: whenever the total IS positive, `runBatch()`
 * immediately transitions the very same row to either `PENDING_APPROVAL`
 * (`policy.requiresApproval`) or `POSTED` (posts immediately) within the
 * SAME transaction that creates it, so a human never actually sees a
 * positive-total batch sitting in `DRAFT`. `post()` (`POST /:id/post`)
 * still genuinely accepts a `DRAFT` batch (its own doc comment: "accepts a
 * batch in EITHER DRAFT or PENDING_APPROVAL... only rejects an
 * already-POSTED batch"), so a direct Post button is offered here for
 * completeness — it's a safe, harmless action on the empty-summary case
 * that's the only one a user will realistically encounter (posting
 * generates zero invoices when `summary.entries` is empty).
 *
 * `requiresApproval` (the OWNING policy's flag — `LateFeeBatchResponseDto`
 * itself carries no denormalized copy of it, so the caller passes it down
 * from its own already-loaded policy query) never gates which buttons
 * render — a real `DRAFT` row's zero-total meaning doesn't depend on it —
 * it only changes the explanatory copy shown alongside the DRAFT Post
 * button, since a policy that requires approval reaching `DRAFT` anyway is
 * worth explaining differently than one that doesn't.
 */
export function LateFeeBatchStatusActions({ batch, requiresApproval }: { batch: LateFeeBatchResponseDto; requiresApproval: boolean }) {
  const t = useTranslations("billing.lateFeeBatches.statusActions");
  const tCommon = useTranslations("common");
  const [postError, setPostError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [draftOpen, setDraftOpen] = React.useState(false);
  const [draftError, setDraftError] = React.useState<string | null>(null);

  const postMutation = usePostLateFeeBatch();
  const decideMutation = useDecideLateFeeBatch();

  const isEmptyRun = parseLateFeeBatchSummary(batch.summary).entries.length === 0;

  async function handlePost() {
    setPostError(null);
    try {
      await postMutation.mutateAsync(batch.id);
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleApproveOpenChange(next: boolean) {
    setApproveOpen(next);
    if (next) setApproveError(null);
  }

  async function handleApprove() {
    setApproveError(null);
    try {
      await decideMutation.mutateAsync({ id: batch.id, dto: { approved: true } });
      setApproveOpen(false);
    } catch (err) {
      setApproveError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleDraftOpenChange(next: boolean) {
    setDraftOpen(next);
    if (next) setDraftError(null);
  }

  async function handleSendBackToDraft() {
    setDraftError(null);
    try {
      await decideMutation.mutateAsync({ id: batch.id, dto: { approved: false } });
      setDraftOpen(false);
    } catch (err) {
      setDraftError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (batch.status === "DRAFT") {
    return (
      <div className="space-y-2">
        <Button type="button" onClick={() => void handlePost()} disabled={postMutation.isPending}>
          {postMutation.isPending ? t("posting") : t("post")}
        </Button>
        {isEmptyRun && (
          <Alert>
            <AlertDescription>{requiresApproval ? t("emptyDraftHintRequiresApproval") : t("emptyDraftHint")}</AlertDescription>
          </Alert>
        )}
        {postError && (
          <Alert variant="destructive">
            <AlertDescription>{postError}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  if (batch.status === "PENDING_APPROVAL") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
          <DialogTrigger asChild>
            <Button type="button">{t("approveTrigger")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("approveConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("approveConfirmDescription")}</DialogDescription>
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

        <Dialog open={draftOpen} onOpenChange={handleDraftOpenChange}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              {t("sendBackToDraftTrigger")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("sendBackToDraftConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("sendBackToDraftConfirmDescription")}</DialogDescription>
            </DialogHeader>

            {draftError && (
              <Alert variant="destructive">
                <AlertDescription>{draftError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDraftOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" variant="destructive" onClick={() => void handleSendBackToDraft()} disabled={decideMutation.isPending}>
                {decideMutation.isPending ? t("sendingBackToDraft") : t("sendBackToDraftConfirmButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}
