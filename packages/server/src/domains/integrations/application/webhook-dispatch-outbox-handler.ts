import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxHandler } from "../../../shared/events/outbox-handler.interface";
import { WebhookDeliveryService } from "./webhook-delivery.service";

/**
 * Generic, event-type-agnostic outbox consumer that fans a matching outbox
 * row out to webhook subscriptions via `WebhookDeliveryService.dispatch()`.
 * One instance is constructed per interesting `eventType` (see the
 * `OUTBOX_HANDLERS` factory binding in `apps/worker`) — this class
 * deliberately doesn't know about billing/payments/students/wallet at all,
 * only the generic `eventType` string + payload the outbox row already
 * carries, so wiring a new event type never requires touching this file. A
 * plain class, constructed via `new`, not a Nest `@Injectable()` provider
 * itself (mirrors `GenericHttpSmsAdapter`'s own "constructed by its
 * resolver, not DI-registered" shape) — `OUTBOX_HANDLERS`' array-of-many-
 * instances shape doesn't fit Nest's one-provider-per-class model.
 *
 * `handle()` opens its OWN fresh transaction — by the time the worker's
 * poll loop invokes a handler, the business transaction that originally
 * wrote the outbox row has long since committed, so there is no ambient
 * `EntityManager` to reuse.
 */
export class WebhookDispatchOutboxHandler implements OutboxHandler {
  readonly consumerName: string;

  constructor(
    readonly eventType: string,
    private readonly webhookDeliveryService: WebhookDeliveryService,
    private readonly dataSource: DataSource,
  ) {
    this.consumerName = `webhook-dispatch:${eventType}`;
  }

  async handle(payload: Record<string, unknown>): Promise<void> {
    await runInTransaction(this.dataSource, (em: EntityManager) => this.webhookDeliveryService.dispatch(em, this.eventType, payload));
  }
}
