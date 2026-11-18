import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "@klickit/server";
import type { Queue } from "bullmq";
import { ACADEMY_PUBLISH_JOB_NAME, ACADEMY_PUBLISH_QUEUE, ACADEMY_PUBLISH_REPEAT_JOB_ID } from "./academy-publish-queue.constants";

/**
 * Registers the invoice-publishing sweep's repeatable trigger once, at worker boot — mirrors `AcademySyncScheduler`.
 * The tick is cheap when there is nothing to do: `AcademyPublishService.publishPending()` returns at once unless an admin
 * has switched publishing on. `AppConfigService.academyPublishPollIntervalMinutes` (default 2) drives `repeat.every`; the
 * fixed `jobId` keeps a restarting worker from accumulating duplicate schedules.
 */
@Injectable()
export class AcademyPublishScheduler implements OnModuleInit {
  private readonly logger = new Logger(AcademyPublishScheduler.name);

  constructor(
    @InjectQueue(ACADEMY_PUBLISH_QUEUE) private readonly queue: Queue,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const everyMs = this.config.academyPublishPollIntervalMinutes * 60_000;
    await this.queue.add(
      ACADEMY_PUBLISH_JOB_NAME,
      {},
      {
        jobId: ACADEMY_PUBLISH_REPEAT_JOB_ID,
        repeat: { every: everyMs },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 },
      },
    );
    this.logger.log(`Academy invoice publishing sweep scheduled — every ${this.config.academyPublishPollIntervalMinutes} minute(s)`);
  }
}
