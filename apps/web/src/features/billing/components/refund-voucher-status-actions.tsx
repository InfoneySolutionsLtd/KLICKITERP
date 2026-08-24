"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RefundVoucherResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import {
  useCancelRefundVoucher,
  useDecideRefundVoucher,
  useMarkRefundVoucherPaid,
  useSubmitRefundVoucher,
} from "../hooks/use-refund-vouchers";

/**
 * Part 6 (Billing sub-features batch) — the fullest lifecycle component in
 * this whole batch, mirroring `payment-voucher-status-actions.tsx`'s exact
 * shape: one `Dialog` per action, each with its own local open/error state.
 * `BillRefundVoucherStatus` real flow (`RefundVouchersService`'s own class
 * doc comment): `DRAFT -[submit]-> PENDING_APPROVAL -[decide]->
 * APPROVED_UNPAID|CANCELLED -[markPaid]-> PAID`, `cancel()` reachable from
 * any of the three pre-`PAID` statuses.
 *
 * **Approve skips a separate `APPROVED` state** — `decide(approved:true)`
 * posts the P-12 GL journal AND lands directly on `APPROVED_UNPAID` in one
 * step (confirmed by reading `onApprovalDecided()` directly) — the approve
 * dialog's own copy says so plainly rather than implying an intermediate
 * "approved, not yet posted" state that doesn't exist here.
 *
 * **Reject is a real terminal `CANCELLED`, not a "back to draft" revert** —
 * unlike Credit Notes' own `decide(approved:false)` (which reverts to
 * `DRAFT` since `BillNoteStatus` has no `REJECTED` value), a refund
 * voucher's `decide(approved:false)` sets `status='CANCELLED'` directly
 * (confirmed by reading the service) — worded as a real rejection/cancel
 * here, not "send back to draft."
 *
 * **Mark Paid is gated by a genuinely SEPARATE permission**
 * (`billing:refund-voucher:mark-paid`, not the `:manage` every other route
 * on this controller shares) — same honest modeling
 * `payment-voucher-status-actions.tsx`'s own doc comment already documents
 * for `execute`: never hidden client-side based on a guessed capability, a
 * role lacking it still sees this button and gets a real 403 via
 * `ApiError.message`. For `MPESA_B2C` it shows the optional
 * `b2cTransactionId` text field with a hint pointing at the already-built,
 * genuinely DISCONNECTED `/payments/mpesa` B2C-initiate page (no automatic
 * linkage exists between the two — confirmed via `RefundVouchersService`'s
 * own class doc comment, "interim manual trigger... standing in for" a real
 * Module 10 B2C result callback that doesn't exist yet). For `CASH`/`BANK`
 * it's a plain "confirm this payment was made" dialog with no id field at
 * all.
 *
 * **Cancel's copy escalates specifically when the current status is
 * `APPROVED_UNPAID`** — `cancel()` never reverses a P-12 journal already
 * posted (`RefundVouchersService.cancel()`'s own class doc comment: "a
 * documented gap... would need a compensating reversal, which this pass
 * does not implement"), so cancelling from `DRAFT`/`PENDING_APPROVAL` is a
 * clean no-GL-effect cancel while cancelling from `APPROVED_UNPAID` leaves a
 * real unreversed journal behind — the dialog shows an extra `Alert
 * variant="warning"` only in that second case, never hidden.
 */
export function RefundVoucherStatusActions({
  voucher,
  studentId,
}: {
  voucher: RefundVoucherResponseDto;
  studentId: string | undefined;
}) {
  const t = useTranslations("billing.refundVouchers.statusActions");
  const tCommon = useTranslations("common");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [markPaidOpen, setMarkPaidOpen] = React.useState(false);
  const [markPaidError, setMarkPaidError] = React.useState<string | null>(null);
  const [b2cTransactionId, setB2cTransactionId] = React.useState("");
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const submitMutation = useSubmitRefundVoucher(studentId);
  const decideMutation = useDecideRefundVoucher(studentId);
  const markPaidMutation = useMarkRefundVoucherPaid(studentId);
  const cancelMutation = useCancelRefundVoucher(studentId);

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(voucher.id);
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
      await decideMutation.mutateAsync({ id: voucher.id, dto: { approved: true } });
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
      await decideMutation.mutateAsync({ id: voucher.id, dto: { approved: false } });
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleMarkPaidOpenChange(next: boolean) {
    setMarkPaidOpen(next);
    if (next) {
      setMarkPaidError(null);
      setB2cTransactionId("");
    }
  }
  async function handleMarkPaid() {
    setMarkPaidError(null);
    try {
      await markPaidMutation.mutateAsync({
        id: voucher.id,
        dto: { b2cTransactionId: b2cTransactionId.trim() || undefined },
      });
      setMarkPaidOpen(false);
    } catch (err) {
      setMarkPaidError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleCancelOpenChange(next: boolean) {
    setCancelOpen(next);
    if (next) setCancelError(null);
  }
  async function handleCancel() {
    setCancelError(null);
    try {
      await cancelMutation.mutateAsync(voucher.id);
      setCancelOpen(false);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const canCancel = voucher.status === "DRAFT" || voucher.status === "PENDING_APPROVAL" || voucher.status === "APPROVED_UNPAID";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {voucher.status === "DRAFT" && (
          <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
          </Button>
        )}

        {voucher.status === "PENDING_APPROVAL" && (
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
                  <DialogDescription>{t("approveConfirmDescription", { number: voucher.number })}</DialogDescription>
                </DialogHeader>
                <Alert variant="warning">
                  <AlertDescription>{t("approveEffectNote")}</AlertDescription>
                </Alert>
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
                  <DialogDescription>{t("rejectConfirmDescription", { number: voucher.number })}</DialogDescription>
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

        {voucher.status === "APPROVED_UNPAID" && (
          <Dialog open={markPaidOpen} onOpenChange={handleMarkPaidOpenChange}>
            <DialogTrigger asChild>
              <Button type="button" size="sm">
                {t("markPaidTrigger")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("markPaidConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("markPaidConfirmDescription", { number: voucher.number })}</DialogDescription>
              </DialogHeader>

              {voucher.method === "MPESA_B2C" && (
                <div className="space-y-1.5">
                  <Label>{t("b2cTransactionId")}</Label>
                  <Input value={b2cTransactionId} onChange={(e) => setB2cTransactionId(e.target.value)} placeholder={t("b2cTransactionIdPlaceholder")} />
                  <p className="text-xs text-muted-foreground">
                    {t("b2cHint")}{" "}
                    <Link href="/payments/mpesa" className="underline underline-offset-2">
                      {t("b2cHintLink")}
                    </Link>
                  </p>
                </div>
              )}

              {markPaidError && (
                <Alert variant="destructive">
                  <AlertDescription>{markPaidError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMarkPaidOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" onClick={() => void handleMarkPaid()} disabled={markPaidMutation.isPending}>
                  {markPaidMutation.isPending ? t("markingPaid") : t("markPaidConfirmButton")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {canCancel && (
          <Dialog open={cancelOpen} onOpenChange={handleCancelOpenChange}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                {t("cancelTrigger")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("cancelConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("cancelConfirmDescription", { number: voucher.number })}</DialogDescription>
              </DialogHeader>
              {voucher.status === "APPROVED_UNPAID" && (
                <Alert variant="warning">
                  <AlertDescription>{t("cancelAfterApprovalWarning")}</AlertDescription>
                </Alert>
              )}
              {cancelError && (
                <Alert variant="destructive">
                  <AlertDescription>{cancelError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="button" variant="destructive" onClick={() => void handleCancel()} disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? t("cancelling") : t("cancelConfirmButton")}
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
