import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface PaymentReceivedPayload extends Record<string, unknown> {
  receiptId: string;
  receiptNumber: string;
  studentId: string;
  total: string;
  cashierId: string;
}

/**
 * Published (via the shared outbox writer) whenever `ReceiptsService.captureReceipt()`
 * inserts a new `pay_receipt` row — mirrors `domains/billing`'s own
 * `InvoicePostedEvent` (added alongside this one, same reason: a real domain
 * event for `WebhookDispatchOutboxHandler`, `domains/integrations`, to fire
 * webhook subscriptions off of). `total` is carried as a decimal string
 * (`Money.toDecimalString()`), same convention every other Money-bearing
 * payload in this codebase's DTOs uses. **Deliberately does not cover**
 * `recordWalletFundedReceipt()`/`recordSubledgerFundedReceipt()` (two other
 * receipt-creation paths on this same service that bypass `captureReceipt()`
 * entirely) — the same documented scope boundary `DocumentVerificationService.mint()`
 * already established for the identical reason (see that call site's own
 * doc comment, "Not called from recordSubledgerFundedReceipt()/reverseReceipt()").
 */
export class PaymentReceivedEvent extends BaseDomainEvent<PaymentReceivedPayload> {
  readonly eventType = "payments.payment_received";
  readonly aggregateType = "pay_receipt";

  constructor(receiptId: string, payload: PaymentReceivedPayload) {
    super(receiptId, payload);
  }
}
