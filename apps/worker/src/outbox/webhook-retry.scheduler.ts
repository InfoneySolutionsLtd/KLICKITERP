import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { WEBHOOK_RETRY_INTERVAL_MS, WEBHOOK_RETRY_JOB_NAME, WEBHOOK_RETRY_QUEUE, WEBHOOK_RETRY_REPEAT_JOB_ID } from "./webhook-retry-queue.constants";

/**
 * Registers `WebhookDeliveryService.processDue()`'s repeatable trigger once,
 * at worker boot — mirrors `OutboxPollScheduler`'s exact shape. Closes the
 * "no scheduler for processDue()" gap: the existing "Process Due Deliveries"
 * manual admin button (`apps/web`) stays exactly as it was (still useful for
 * an immediate/on-demand trigger), this just adds the automatic path that
 * was previously entirely missing — every webhook retry used to require a
 * human to click a button.
 */
@Injectable()
export class WebhookRetryScheduler implements OnModuleInit {
  private readonly logger = new Logger(WebhookRetryScheduler.name);

  constructor(@InjectQueue(WEBHOOK_RETRY_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      WEBHOOK_RETRY_JOB_NAME,
      {},
      {
        jobId: WEBHOOK_RETRY_REPEAT_JOB_ID,
        repeat: { every: WEBHOOK_RETRY_INTERVAL_MS },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 },
      },
    );
    this.logger.log(`Webhook retry repeatable job scheduled — every ${WEBHOOK_RETRY_INTERVAL_MS}ms`);
  }
}
