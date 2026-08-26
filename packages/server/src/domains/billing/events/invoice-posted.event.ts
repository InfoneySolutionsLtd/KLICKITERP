import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface InvoicePostedPayload extends Record<string, unknown> {
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  termId: string;
  total: string;
  postedBy: string;
}

/**
 * Published (via the shared outbox writer) whenever `InvoicingService.postInvoice()`
 * moves an invoice from DRAFT to POSTED — the first outbox event this domain
 * emits (`domains/billing` had zero outbox writes before this; `domains/students`/
 * `domains/wallet` are the only other domains that emit any today). Added
 * specifically so a real domain event exists for webhook subscribers to
 * subscribe to (`WebhookDispatchOutboxHandler`, `domains/integrations`) —
 * `total` is carried as a decimal string (`Money.toDecimalString()`), the
 * same wire-shape convention every other Money-bearing payload in this
 * codebase's DTOs already uses, since `DomainEvent.payload` is plain JSON.
 */
export class InvoicePostedEvent extends BaseDomainEvent<InvoicePostedPayload> {
  readonly eventType = "billing.invoice_posted";
  readonly aggregateType = "bill_invoice";

  constructor(invoiceId: string, payload: InvoicePostedPayload) {
    super(invoiceId, payload);
  }
}
