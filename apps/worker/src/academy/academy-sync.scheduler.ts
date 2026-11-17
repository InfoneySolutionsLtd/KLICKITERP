import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "@klickit/server";
import type { Queue } from "bullmq";
import { ACADEMY_SYNC_JOB_NAME, ACADEMY_SYNC_QUEUE, ACADEMY_SYNC_REPEAT_JOB_ID } from "./academy-sync-queue.constants";

/**
 * Registers the Academy student sync's repeatable trigger once, at worker boot — mirrors
 * `AcademyEntitlementScheduler`. The tick is cheap when there is nothing to do: `AcademySyncService.runScheduled()`
 * returns at once unless an admin has confirmed the first import AND switched automatic sync on.
 * `AppConfigService.academySyncPollIntervalMinutes` (default 15) drives `repeat.every`; the fixed `jobId` keeps a
 * restarting worker from accumulating duplicate schedules.
 */
@Injectable()
export class AcademySyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(AcademySyncScheduler.name);

  constructor(
    @InjectQueue(ACADEMY_SYNC_QUEUE) private readonly queue: Queue,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const everyMs = this.config.academySyncPollIntervalMinutes * 60_000;
    await this.queue.add(
      ACADEMY_SYNC_JOB_NAME,
      {},
      {
        jobId: ACADEMY_SYNC_REPEAT_JOB_ID,
        repeat: { every: everyMs },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 },
      },
    );
    this.logger.log(`Academy student sync repeatable job scheduled — every ${this.config.academySyncPollIntervalMinutes} minute(s)`);
  }
}
