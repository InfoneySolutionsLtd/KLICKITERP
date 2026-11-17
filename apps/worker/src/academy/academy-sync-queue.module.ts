import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { AcademySyncModule } from "@klickit/server";
import { AcademySyncProcessor } from "./academy-sync.processor";
import { AcademySyncScheduler } from "./academy-sync.scheduler";
import { ACADEMY_SYNC_QUEUE } from "./academy-sync-queue.constants";

/**
 * Registers the `academy-sync` queue only (`BullModule.registerQueue()`) — the shared BullMQ Redis connection is already
 * established once by `OutboxQueueModule`, exactly as `AcademyEntitlementQueueModule` documents. `AcademySyncModule` is
 * imported so the processor can inject `AcademySyncService`; `AppModule` also imports it directly (Nest singletons make
 * the double import safe). `@Global()` for the same "imported once, needs no further wiring" shape as its siblings.
 */
@Global()
@Module({
  imports: [AcademySyncModule, BullModule.registerQueue({ name: ACADEMY_SYNC_QUEUE })],
  providers: [AcademySyncProcessor, AcademySyncScheduler],
})
export class AcademySyncQueueModule {}
