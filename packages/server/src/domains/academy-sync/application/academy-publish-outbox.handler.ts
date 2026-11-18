import { Logger } from "@nestjs/common";
import { DomainEvent } from "../../../shared/events/domain-event";
import { OutboxHandler } from "../../../shared/events/outbox-handler.interface";
import { AcademyPublishService } from "./academy-publish.service";

/**
 * Makes the parent portal catch up quickly after the two events that change what a family owes: a newly POSTED invoice
 * (`billing.invoice_posted`) and a payment received (`payments.payment_received`, which settles invoices). Both carry the
 * `studentId`, so this re-publishes that student's pending invoices straight away.
 *
 * It is a latency optimisation, not the safety net: if the Academy is down or the send fails, this handler swallows the
 * error (so the outbox row does not stay stuck retrying) and the periodic sweep (`AcademyPublishService.publishPending`,
 * every few minutes, driven by `apps/worker`) sends whatever is still behind. Every other way an invoice changes (a void, a
 * credit note, a reversal, a late fee) is caught by that same sweep, because it bumps `bill_invoice.version`.
 *
 * A plain class built by `apps/worker` and added to the ONE combined `OUTBOX_HANDLERS` array (see
 * `webhook-dispatch.module.ts` — a second registration of that token would clobber the first). Several handlers for the
 * same `eventType` are legal (the dispatcher fans out), and `consumerName` keeps this one's idempotency ledger separate
 * from the webhook dispatcher's.
 */
export class AcademyPublishOutboxHandler implements OutboxHandler {
  private readonly logger = new Logger(AcademyPublishOutboxHandler.name);
  readonly consumerName: string;

  constructor(
    readonly eventType: string,
    private readonly publishService: AcademyPublishService,
  ) {
    this.consumerName = `academy-publish:${eventType}`;
  }

  async handle(payload: Record<string, unknown>, _event?: DomainEvent<Record<string, unknown>>): Promise<void> {
    const studentId = payload.studentId;
    if (typeof studentId !== "string" || studentId.length === 0) {
      return;
    }
    try {
      await this.publishService.publishPending({ studentId, maxBatches: 1 });
    } catch (error) {
      this.logger.warn(`Could not publish after ${this.eventType} for student ${studentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** The ERP events that should make the portal catch up straight away. */
export const ACADEMY_PUBLISH_EVENT_TYPES = ["billing.invoice_posted", "payments.payment_received"] as const;
