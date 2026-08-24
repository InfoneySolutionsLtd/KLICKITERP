import type {
  CreateRefundVoucherDto,
  DecideRefundVoucherDto,
  MarkRefundVoucherPaidDto,
  RefundVoucherResponseDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `RefundVouchersController`
 * (`packages/server/src/domains/billing/api/refund-vouchers.controller.ts`).
 * Permissions: `billing:refund-voucher:manage` (create/submit/decide/cancel),
 * `billing:refund-voucher:view` (list/get), and a genuinely SEPARATE
 * `billing:refund-voucher:mark-paid` for `markPaid()` — modeled honestly the
 * same way `payment-voucher-status-actions.tsx`'s own doc comment already
 * documents for `execute`'s separate permission: never guessed/hidden
 * client-side, a role lacking it still sees the button and gets a real 403
 * surfaced via `ApiError.message`.
 *
 * `listByStudent`'s `studentId` query param is a genuinely required string on
 * `RefundVouchersController.list()` (confirmed by reading the controller —
 * unlike several other endpoints in this module, this one has no
 * declared-vs-real optional-query codegen gap), so this mirrors
 * `listInvoicesForStudent()`'s (`invoices.api.ts`) plain `{ query: { studentId } }`
 * shape directly, no `optionalQuery()` needed.
 */
export async function listRefundVouchersByStudent(studentId: string): Promise<RefundVoucherResponseDto[]> {
  return unwrapApiResult<RefundVoucherResponseDto[]>(
    await apiClient.GET("/api/v1/billing/refund-vouchers", { params: { query: { studentId } } }),
  );
}

export async function getRefundVoucher(id: string): Promise<RefundVoucherResponseDto> {
  return unwrapApiResult<RefundVoucherResponseDto>(
    await apiClient.GET("/api/v1/billing/refund-vouchers/{id}", { params: { path: { id } } }),
  );
}

/** `create()` validates `amount` against the student's real current credit balance server-side (BR-BILL-12) — a real `400` (`ValidationException`) when it's exceeded, surfaced to the caller via `ApiError.message` (this module has no dedicated `isX` error-shape helper for it, unlike `invoices.api.ts`'s BR-BILL-04/GL-not-configured checks — the message itself is descriptive enough to show directly). */
export async function createRefundVoucher(dto: CreateRefundVoucherDto): Promise<RefundVoucherResponseDto> {
  return unwrapApiResult<RefundVoucherResponseDto>(await apiClient.POST("/api/v1/billing/refund-vouchers", { body: dto }));
}

export async function submitRefundVoucher(id: string): Promise<RefundVoucherResponseDto> {
  return unwrapApiResult<RefundVoucherResponseDto>(
    await apiClient.POST("/api/v1/billing/refund-vouchers/{id}/submit", { params: { path: { id } } }),
  );
}

/** `approved:true` posts P-12 (debit AR_STUDENT / credit the resolved payout account) and lands the voucher directly on `APPROVED_UNPAID` — no separate `APPROVED` step. `approved:false` moves straight to `CANCELLED` with no GL activity at all (not a "back to draft" revert, unlike Credit Notes' own reject). */
export async function decideRefundVoucher(id: string, dto: DecideRefundVoucherDto): Promise<RefundVoucherResponseDto> {
  return unwrapApiResult<RefundVoucherResponseDto>(
    await apiClient.POST("/api/v1/billing/refund-vouchers/{id}/decide", { params: { path: { id } }, body: dto }),
  );
}

export async function markRefundVoucherPaid(id: string, dto: MarkRefundVoucherPaidDto): Promise<RefundVoucherResponseDto> {
  return unwrapApiResult<RefundVoucherResponseDto>(
    await apiClient.POST("/api/v1/billing/refund-vouchers/{id}/mark-paid", { params: { path: { id } }, body: dto }),
  );
}

/** Works from any pre-`PAID` status. Does NOT reverse the P-12 journal once one has already been posted (i.e. cancelling FROM `APPROVED_UNPAID`) — a real, documented gap (`RefundVouchersService.cancel()`'s own class doc comment), surfaced honestly in `RefundVoucherStatusActions`' cancel-confirm copy rather than hidden. */
export async function cancelRefundVoucher(id: string): Promise<RefundVoucherResponseDto> {
  return unwrapApiResult<RefundVoucherResponseDto>(
    await apiClient.POST("/api/v1/billing/refund-vouchers/{id}/cancel", { params: { path: { id } } }),
  );
}
