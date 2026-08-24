"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateRefundVoucherDto, DecideRefundVoucherDto, MarkRefundVoucherPaidDto } from "@klickit/contracts";
import {
  cancelRefundVoucher,
  createRefundVoucher,
  decideRefundVoucher,
  getRefundVoucher,
  listRefundVouchersByStudent,
  markRefundVoucherPaid,
  submitRefundVoucher,
} from "../api/refund-vouchers.api";

export const REFUND_VOUCHERS_QUERY_KEY = ["billing", "refund-vouchers"] as const;

function studentRefundVouchersKey(studentId: string | undefined) {
  return [...REFUND_VOUCHERS_QUERY_KEY, "student", studentId] as const;
}
function detailKey(id: string | undefined) {
  return [...REFUND_VOUCHERS_QUERY_KEY, "detail", id] as const;
}

export function useRefundVouchersByStudent(studentId: string | undefined) {
  return useQuery({
    queryKey: studentRefundVouchersKey(studentId),
    queryFn: () => listRefundVouchersByStudent(studentId as string),
    enabled: !!studentId,
  });
}

export function useRefundVoucher(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getRefundVoucher(id as string),
    enabled: !!id,
  });
}

/** `create()` only validates against the student's credit balance (BR-BILL-12) — no GL/ledger side effect, so only the student's own voucher list needs invalidating. */
export function useCreateRefundVoucher(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRefundVoucherDto) => createRefundVoucher(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentRefundVouchersKey(studentId) });
    },
  });
}

/** `submitForApproval()` only allocates an approval instance/flips status — no GL/ledger effect. */
export function useSubmitRefundVoucher(studentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitRefundVoucher(id),
    onSuccess: (voucher) => {
      queryClient.invalidateQueries({ queryKey: detailKey(voucher.id) });
      queryClient.invalidateQueries({ queryKey: studentRefundVouchersKey(studentId) });
    },
  });
}

/**
 * `onApprovalDecided()` — see that service method's own doc comment ("P-12").
 * Only the `approved:true` branch posts a real GL journal AND a
 * `std_ledger_entry` debit for the student (bringing their negative/credit
 * running balance back toward zero) — confirmed by reading the service
 * directly; the `approved:false` branch is a plain status flip to
 * `CANCELLED` with zero ledger/GL activity. The response's own `status` is
 * the simplest reliable signal of which branch actually ran (`APPROVED_UNPAID`
 * only ever results from the approve path), so this only cross-invalidates
 * `["students","ledger",studentId]` (matching `usePostInvoice()`'s own
 * invalidation-set convention, `use-invoices.ts`) when that's what comes
 * back — a reject response never touches the ledger, so invalidating it then
 * would just be a wasted refetch.
 */
export function useDecideRefundVoucher(studentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecideRefundVoucherDto }) => decideRefundVoucher(id, dto),
    onSuccess: (voucher) => {
      queryClient.invalidateQueries({ queryKey: detailKey(voucher.id) });
      queryClient.invalidateQueries({ queryKey: studentRefundVouchersKey(studentId) });
      if (voucher.status === "APPROVED_UNPAID") {
        queryClient.invalidateQueries({ queryKey: ["students", "ledger", studentId] });
      }
    },
  });
}

/** `markPaid()` only flips `status`/optionally sets `b2cTransactionId` — the GL journal and ledger entry were already posted at the `decide()` step, so no further ledger invalidation is needed here (confirmed by reading `RefundVouchersService.markPaid()` directly: no `StudentLedgerService` call at all). */
export function useMarkRefundVoucherPaid(studentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: MarkRefundVoucherPaidDto }) => markRefundVoucherPaid(id, dto),
    onSuccess: (voucher) => {
      queryClient.invalidateQueries({ queryKey: detailKey(voucher.id) });
      queryClient.invalidateQueries({ queryKey: studentRefundVouchersKey(studentId) });
    },
  });
}

/** `cancel()` is a plain status flip to `CANCELLED` from any pre-`PAID` status — never reverses a journal already posted (see `refund-vouchers.api.ts`'s own doc comment on `cancelRefundVoucher()`), so no ledger key needs invalidating here either. */
export function useCancelRefundVoucher(studentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelRefundVoucher(id),
    onSuccess: (voucher) => {
      queryClient.invalidateQueries({ queryKey: detailKey(voucher.id) });
      queryClient.invalidateQueries({ queryKey: studentRefundVouchersKey(studentId) });
    },
  });
}
