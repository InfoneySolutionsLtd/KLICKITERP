import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { runInTransaction, WebhookDeliveryService } from "@klickit/server";
import type { Job } from "bullmq";
import type { DataSource } from "typeorm";
import { WEBHOOK_RETRY_QUEUE } from "./webhook-retry-queue.constants";

/**
 * BullMQ worker consuming the `webhook-retry` queue's repeatable job
 * (`WebhookRetryScheduler` schedules it) — mirrors `OutboxPollProcessor`'s
 * exact shape. `concurrency: 1` is this process's own overlap guard, same
 * reasoning as that file's own doc comment. Wraps `WebhookDeliveryService.processDue()`
 * in its own transaction via `runInTransaction()` — there is no ambient
 * business transaction in a BullMQ job handler, the same reason
 * `WebhookDispatchOutboxHandler.handle()` does the identical wrap.
 */
@Processor(WEBHOOK_RETRY_QUEUE, { concurrency: 1 })
export class WebhookRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookRetryProcessor.name);

  constructor(
    private readonly webhookDeliveryService: WebhookDeliveryService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const result = await runInTransaction(this.dataSource, (em) => this.webhookDeliveryService.processDue(em));
    if (result.processed > 0 || result.failed > 0) {
      this.logger.log(`Webhook retry: processed ${result.processed}, failed ${result.failed}`);
    }
  }
}
