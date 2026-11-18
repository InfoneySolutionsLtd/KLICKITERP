import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { AcademyPublishService } from "@klickit/server";
import type { Job } from "bullmq";
import { ACADEMY_PUBLISH_QUEUE } from "./academy-publish-queue.constants";

/**
 * BullMQ worker consuming the `academy-publish` queue's repeatable job. `concurrency: 1` keeps two ticks from overlapping
 * in this process (a Redis lock also keeps the API's "Publish now" and this sweep from running together). All logic lives
 * in `AcademyPublishService.publishPending()`; a failed send is recorded on the sync state and shown on the card, and the
 * invoices simply stay pending for the next tick, so this never needs to fail the BullMQ job.
 */
@Processor(ACADEMY_PUBLISH_QUEUE, { concurrency: 1 })
export class AcademyPublishProcessor extends WorkerHost {
  private readonly logger = new Logger(AcademyPublishProcessor.name);

  constructor(private readonly publishService: AcademyPublishService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const result = await this.publishService.publishPending();
    if (!result || (result.sent === 0 && !result.error)) {
      return;
    }
    this.logger.log(
      `Academy invoice publishing: sent ${result.sent} (new ${result.created}, updated ${result.updated}, up to date ${result.unchanged + result.stale}, not accepted ${result.rejected})${result.error ? ` — error: ${result.error}` : ""}`,
    );
  }
}
