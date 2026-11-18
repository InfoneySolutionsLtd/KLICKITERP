import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { AcademySyncModule } from "@klickit/server";
import { AcademyPublishProcessor } from "./academy-publish.processor";
import { AcademyPublishScheduler } from "./academy-publish.scheduler";
import { ACADEMY_PUBLISH_QUEUE } from "./academy-publish-queue.constants";

/**
 * Registers the `academy-publish` queue only (`BullModule.registerQueue()`) — the shared BullMQ Redis connection is already
 * established once by `OutboxQueueModule`, exactly as `AcademySyncQueueModule` documents. `AcademySyncModule` is imported
 * so the processor can inject `AcademyPublishService`; `AppModule` also imports it directly (Nest singletons make the
 * double import safe).
 */
@Global()
@Module({
  imports: [AcademySyncModule, BullModule.registerQueue({ name: ACADEMY_PUBLISH_QUEUE })],
  providers: [AcademyPublishProcessor, AcademyPublishScheduler],
})
export class AcademyPublishQueueModule {}
