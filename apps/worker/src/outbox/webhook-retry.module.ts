import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { IntegrationsModule } from "@klickit/server";
import { WEBHOOK_RETRY_QUEUE } from "./webhook-retry-queue.constants";
import { WebhookRetryProcessor } from "./webhook-retry.processor";
import { WebhookRetryScheduler } from "./webhook-retry.scheduler";

/**
 * Registers the `webhook-retry` queue only (`BullModule.registerQueue()`) —
 * deliberately does NOT call `BullModule.forRootAsync()` again:
 * `OutboxQueueModule` (imported earlier in `AppModule`'s own `imports`
 * array) already establishes the shared BullMQ Redis connection once for
 * the whole application; `@nestjs/bullmq`'s root registration is global by
 * design, so a second `forRootAsync()` call here would be redundant at best
 * and a wasted duplicate Redis connection at worst.
 *
 * `@Global()` for the same reason `WebhookDispatchModule` needs it — not
 * strictly required for THIS module's own two providers (nothing outside
 * this module injects `WebhookRetryScheduler`/`WebhookRetryProcessor`
 * directly), but kept consistent with its sibling for the same "imported
 * once by `AppModule`, needs no further wiring anywhere else" shape.
 */
@Global()
@Module({
  imports: [IntegrationsModule, BullModule.registerQueue({ name: WEBHOOK_RETRY_QUEUE })],
  providers: [WebhookRetryProcessor, WebhookRetryScheduler],
})
export class WebhookRetryModule {}
