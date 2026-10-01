import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "@klickit/server";
import type { Queue } from "bullmq";
import {
  ACADEMY_ENTITLEMENT_JOB_NAME,
  ACADEMY_ENTITLEMENT_QUEUE,
  ACADEMY_ENTITLEMENT_REPEAT_JOB_ID,
} from "./academy-entitlement-queue.constants";

/**
 * Registers the Academy entitlement recheck's repeatable trigger once, at
 * worker boot — mirrors `OutboxPollScheduler`'s exact shape.
 * `AppConfigService.academyEntitlementPollIntervalMinutes` (default 15,
 * matching the integration spec's own recommended cadence) drives
 * `repeat.every`. Fixed `jobId` so restarting the worker never accumulates
 * duplicate repeatable schedules.
 */
@Injectable()
export class AcademyEntitlementScheduler implements OnModuleInit {
  private readonly logger = new Logger(AcademyEntitlementScheduler.name);

  constructor(
    @InjectQueue(ACADEMY_ENTITLEMENT_QUEUE) private readonly queue: Queue,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const everyMs = this.config.academyEntitlementPollIntervalMinutes * 60_000;
    await this.queue.add(
      ACADEMY_ENTITLEMENT_JOB_NAME,
      {},
      {
        jobId: ACADEMY_ENTITLEMENT_REPEAT_JOB_ID,
        repeat: { every: everyMs },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 },
      },
    );
    this.logger.log(
      `Academy entitlement recheck repeatable job scheduled — every ${this.config.academyEntitlementPollIntervalMinutes} minute(s)`,
    );
  }
}
