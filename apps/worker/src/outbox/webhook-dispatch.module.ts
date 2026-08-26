import { Global, Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { IntegrationsModule, OUTBOX_HANDLERS, WebhookDeliveryService, WebhookDispatchOutboxHandler } from "@klickit/server";

/**
 * Complete the Integrations area, Part 3.2 — closes the "webhooks exist but
 * nothing ever fires one" gap: `WebhookDeliveryService.dispatch()` and the
 * generic outbox dispatcher (`OutboxDispatcherService.pollOnce()`,
 * `OutboxQueueModule`) both already worked in isolation, but `OUTBOX_HANDLERS`
 * (the DI array token `OutboxDispatcherService` reads, `@Optional()`,
 * defaulting to `[]`) was bound to nothing anywhere — this module is the
 * first real binding.
 *
 * `WEBHOOK_EVENT_TYPES` lists every outbox `eventType` this codebase
 * currently emits that's worth offering as a webhook subscription target —
 * both the two brand-new ones (`billing.invoice_posted`/`payments.payment_received`,
 * added alongside this module specifically so a real event exists to wire)
 * and the pre-existing, previously-orphaned ones from `domains/students`/
 * `domains/wallet` (emitted since well before this pass, never consumed by
 * anything — wiring them here is free: `WebhookDeliveryService.dispatch()`
 * already no-ops when zero subscriptions match a given `eventType`, so
 * listing an event nobody has subscribed to yet costs nothing).
 *
 * ONE combined `useFactory` builds every handler instance — NOT one
 * `OUTBOX_HANDLERS` registration per event type, which would silently
 * CLOBBER rather than merge (NestJS has no built-in multi-provider
 * primitive; `OutboxDispatcherModule`'s own doc comment already documents
 * this exact array-factory shape as the idiomatic fix). `WebhookDispatchOutboxHandler`
 * is a plain class (constructed via `new`, not itself a Nest provider) — see
 * its own doc comment for why.
 *
 * **`@Global()`, and why it's required, not stylistic**: `OutboxDispatcherModule`
 * (`packages/server`, imported by `apps/worker/src/outbox/outbox-queue.module.ts`)
 * declares `imports: []` — Nest resolves a class's constructor deps only
 * from its OWN declaring module's injector (itself + whatever that module
 * imports), so a plain, non-global module binding `OUTBOX_HANDLERS` in its
 * own `providers` array would NEVER be visible to `OutboxDispatcherService`,
 * no matter how deep it sits in `AppModule`'s own `imports` tree —
 * `@Optional()` means this fails SILENTLY (defaults to `[]`, no boot error,
 * handlers simply never fire). `@Global()` is the exact fix
 * `shared/infra/shared-infra.module.ts` already established for the
 * identical class of problem (see that file's own doc comment): a global
 * module's exports become visible to every injector in the whole
 * application once the module is imported anywhere — here, once by
 * `AppModule`.
 */
const WEBHOOK_EVENT_TYPES = [
  "billing.invoice_posted",
  "payments.payment_received",
  "students.student_enrolled",
  "students.student_status_changed",
  "students.promotion_batch_executed",
  "wallet.wallet_transaction_posted",
  "wallet.wallet_status_changed",
] as const;

@Global()
@Module({
  imports: [IntegrationsModule],
  providers: [
    {
      provide: OUTBOX_HANDLERS,
      useFactory: (webhookDeliveryService: WebhookDeliveryService, dataSource: DataSource) =>
        WEBHOOK_EVENT_TYPES.map((eventType) => new WebhookDispatchOutboxHandler(eventType, webhookDeliveryService, dataSource)),
      inject: [WebhookDeliveryService, DataSource],
    },
  ],
  exports: [OUTBOX_HANDLERS],
})
export class WebhookDispatchModule {}
