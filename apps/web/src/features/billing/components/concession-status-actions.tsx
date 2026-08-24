"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ConcessionResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useDecideConcession } from "../hooks/use-concessions";

/**
 * Part 4 (Billing sub-features batch) — approve/reject dialog pair for a
 * `PENDING_APPROVAL` concession, mirroring `budget-status-actions.tsx`'s
 * manual-trigger decide shape (2-3-state lifecycle template, per the plan).
 * `BillConcessionStatus` has a real terminal `REJECTED` (unlike Credit/Debit
 * Notes' decide()-reverts-to-DRAFT shape), so the reject copy below reads as
 * a genuine rejection, not a "send back to draft" note.
 *
 * Context-independent by design: takes only the concession itself, deriving
 * `studentId`/`invoiceId` straight off its own fields
 * (`concession.studentId`/`concession.invoiceId`) rather than requiring the
 * caller to thread page context through — safe to render unmodified from
 * both the student-scoped Card and the invoice-scoped section.
 */
export function ConcessionStatusActions({ concession }: { concession: ConcessionResponseDto }) {
  const t = useTranslations("billing.concessions.statusActions");
  const tCommon = useTranslations("common");

  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);

  const decideMutation = useDecideConcession(concession.studentId, concession.invoiceId ?? undefined);

  function handleApproveOpenChange(next: boolean) {
    setApproveOpen(next);
    if (next) setApproveError(null);
  }

  async function handleApprove() {
    setApproveError(null);
    try {
      await decideMutation.mutateAsync({ id: concession.id, dto: { approved: true } });
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
      await decideMutation.mutateAsync({ id: concession.id, dto: { approved: false } });
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (concession.status !== "PENDING_APPROVAL") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={approveOpen} onOpenChange={handleApproveOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" size="sm">
            {t("approveTrigger")}
          </Button>
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

      <Dialog open={rejectOpen} onOpenChange={handleRejectOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline">
            {t("rejectTrigger")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("rejectConfirmDescription")}</DialogDescription>
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
    </div>
  );
}
