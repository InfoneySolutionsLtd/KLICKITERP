import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { AcademyEntitlementService } from "@klickit/server";
import type { Job } from "bullmq";
import { ACADEMY_ENTITLEMENT_QUEUE } from "./academy-entitlement-queue.constants";

/**
 * BullMQ worker consuming the `academy-entitlement` queue's repeatable job
 * (`AcademyEntitlementScheduler` schedules it) — mirrors `OutboxPollProcessor`'s
 * exact shape. `concurrency: 1` prevents two recheck ticks from ever
 * overlapping in this process. Delegates entirely to
 * `AcademyEntitlementService.checkEntitlement()` (from `@klickit/server`,
 * `licensing/application/academy-entitlement.service.ts`) — this processor
 * owns no logic of its own, purely the BullMQ trigger plumbing.
 */
@Processor(ACADEMY_ENTITLEMENT_QUEUE, { concurrency: 1 })
export class AcademyEntitlementProcessor extends WorkerHost {
  private readonly logger = new Logger(AcademyEntitlementProcessor.name);

  constructor(private readonly entitlementService: AcademyEntitlementService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.entitlementService.checkEntitlement();
    this.logger.debug("Academy entitlement recheck completed.");
  }
}
