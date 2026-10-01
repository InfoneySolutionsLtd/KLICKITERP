import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { LicensingModule } from "@klickit/server";
import { AcademyEntitlementProcessor } from "./academy-entitlement.processor";
import { AcademyEntitlementScheduler } from "./academy-entitlement.scheduler";
import { ACADEMY_ENTITLEMENT_QUEUE } from "./academy-entitlement-queue.constants";

/**
 * Registers the `academy-entitlement` queue only (`BullModule.registerQueue()`)
 * — deliberately does NOT call `BullModule.forRootAsync()` again:
 * `OutboxQueueModule` (imported earlier in `AppModule`'s own `imports`
 * array) already establishes the shared BullMQ Redis connection once for
 * the whole application; `@nestjs/bullmq`'s root registration is global by
 * design, so a second call here would be redundant at best and a wasted
 * duplicate Redis connection at worst. Mirrors `WebhookRetryModule`'s exact
 * shape/reasoning.
 *
 * `LicensingModule` (from `@klickit/server`) is imported here so
 * `AcademyEntitlementProcessor` can inject `AcademyEntitlementService` —
 * `apps/worker/src/app.module.ts` ALSO imports `LicensingModule` directly
 * for the full module graph every other BullMQ-free module needs; NestJS
 * module singletons make importing the same module from multiple places
 * safe (the same precedent `apps/api/src/app.module.ts`'s own doc comment
 * documents for `FilesModule`).
 *
 * `@Global()` for the same reason `WebhookRetryModule`/`WebhookDispatchModule`
 * need it — nothing outside this module injects its own two providers
 * directly, kept consistent with its siblings' "imported once by
 * `AppModule`, needs no further wiring anywhere else" shape.
 */
@Global()
@Module({
  imports: [LicensingModule, BullModule.registerQueue({ name: ACADEMY_ENTITLEMENT_QUEUE })],
  providers: [AcademyEntitlementProcessor, AcademyEntitlementScheduler],
})
export class AcademyEntitlementQueueModule {}
