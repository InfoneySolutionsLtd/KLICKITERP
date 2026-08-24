"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/** `BillFeeStructureStatus` (`DRAFT`/`PUBLISHED`/`SUPERSEDED`, `bill-fee-structure.entity.ts`) — same soft-tint badge convention `STATUS_BADGE_VARIANT` (students module) established. */
const FEE_STRUCTURE_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  PUBLISHED: "soft-success",
  SUPERSEDED: "soft-destructive",
};

export function FeeStructureStatusBadge({ status }: { status: string }) {
  const t = useTranslations("billing.feeStructures.statusValues");
  return <Badge variant={FEE_STRUCTURE_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

/** `BillInvoiceStatus` (`bill-invoice.entity.ts`) — this slice only drives DRAFT->POSTED->VOID (generate/post/void); PENDING_APPROVAL/APPROVED/PARTIALLY_PAID/PAID are real statuses this module can still observe (e.g. from prior test fixtures or a future payments-integration slice) so they're all labeled, not just the three this slice's own flow produces. */
const INVOICE_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-warning",
  POSTED: "soft-primary",
  PARTIALLY_PAID: "soft-warning",
  PAID: "soft-success",
  VOID: "soft-destructive",
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const t = useTranslations("billing.invoices.statusValues");
  return <Badge variant={INVOICE_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

/**
 * Phase 6 Slice 22 Part 5 — `BillNoteStatus` values shared by both
 * `bill_credit_note`/`bill_debit_note` at the DDL level, but each service
 * only ever produces a subset: Credit Notes real 4-state lifecycle
 * (`credit-notes.service.ts`) vs. Debit Notes' `DRAFT -> POSTED`-only path
 * (`debit-notes.service.ts`, no approval workflow seeded for this document
 * type) — kept as two separate maps/components (not one shared
 * `NoteStatusBadge`) since their translated label sets genuinely differ
 * (`billing.creditNotes.statusValues` has 4 keys, `billing.debitNotes.statusValues`
 * has 2), matching `FeeStructureStatusBadge`/`InvoiceStatusBadge`'s own
 * precedent of one badge component per real status enum.
 */
const CREDIT_NOTE_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-warning",
  POSTED: "soft-primary",
};

export function CreditNoteStatusBadge({ status }: { status: string }) {
  const t = useTranslations("billing.creditNotes.statusValues");
  return <Badge variant={CREDIT_NOTE_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

const DEBIT_NOTE_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  POSTED: "soft-primary",
};

export function DebitNoteStatusBadge({ status }: { status: string }) {
  const t = useTranslations("billing.debitNotes.statusValues");
  return <Badge variant={DEBIT_NOTE_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

/**
 * Part 6 (Billing sub-features batch) — `BillRefundVoucherStatus`
 * (`bill-refund-voucher.entity.ts`). The DDL also defines a standalone
 * `APPROVED` value this pass's flow never transits through
 * (`RefundVouchersService`'s own class doc comment: `onApprovalDecided()`
 * posts the GL journal and lands directly on `APPROVED_UNPAID` in one step) —
 * still labeled here for completeness/forward-compat, matching
 * `InvoiceStatusBadge`'s own precedent of labeling every DDL-level status
 * even when the current flow only produces a subset.
 */
const REFUND_VOUCHER_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-warning",
  APPROVED_UNPAID: "soft-warning",
  PAID: "soft-success",
  CANCELLED: "soft-destructive",
};

export function RefundVoucherStatusBadge({ status }: { status: string }) {
  const t = useTranslations("billing.refundVouchers.statusValues");
  return <Badge variant={REFUND_VOUCHER_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}

/**
 * Part 4 (Billing sub-features batch) — `BillConcessionStatus`
 * (`bill-concession.entity.ts`): `PENDING_APPROVAL -> APPROVED|REJECTED ->
 * POSTED`, real terminal `REJECTED` (unlike Credit/Debit Notes' own
 * decide()-reverts-to-DRAFT shape — `ConcessionsService.onApprovalDecided()`
 * sets a genuine `REJECTED` status, confirmed by reading it directly), same
 * soft-tint convention every other status badge in this file follows.
 */
const CONCESSION_STATUS_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-warning",
  REJECTED: "soft-destructive",
  POSTED: "soft-primary",
};

export function ConcessionStatusBadge({ status }: { status: string }) {
  const t = useTranslations("billing.concessions.statusValues");
  return <Badge variant={CONCESSION_STATUS_VARIANT[status] ?? "outline"}>{t(status)}</Badge>;
}
