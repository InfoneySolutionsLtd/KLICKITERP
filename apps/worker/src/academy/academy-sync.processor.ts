import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { AcademySyncService } from "@klickit/server";
import type { Job } from "bullmq";
import { ACADEMY_SYNC_QUEUE } from "./academy-sync-queue.constants";

/**
 * BullMQ worker consuming the `academy-sync` queue's repeatable job. `concurrency: 1` keeps two ticks from overlapping
 * in this process (the database also allows only one RUNNING sync across processes). All logic lives in
 * `AcademySyncService.runScheduled()`; this is only the trigger plumbing. A failed run is recorded on its own run row
 * (and shown on the Academy sync card), so it does not need to fail the BullMQ job.
 */
@Processor(ACADEMY_SYNC_QUEUE, { concurrency: 1 })
export class AcademySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AcademySyncProcessor.name);

  constructor(private readonly syncService: AcademySyncService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const run = await this.syncService.runScheduled();
    if (!run) {
      return;
    }
    this.logger.log(
      `Academy sync ${run.scope}: ${run.status} — seen ${run.counts.seen ?? 0}, created ${run.counts.created ?? 0}, linked ${run.counts.linked ?? 0}, updated ${run.counts.updated ?? 0}, issues ${run.issuesTotal}`,
    );
  }
}
