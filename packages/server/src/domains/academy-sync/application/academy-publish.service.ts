import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ACADEMY_LINK_PORT } from "../../../shared/integrations/academy/academy-link.port";
import type { AcademyLinkPort } from "../../../shared/integrations/academy/academy-link.port";
import { AcadSyncStateEntity } from "../domain/acad-sync-state.entity";
import { AcadSyncStateRepository } from "../infrastructure/acad-sync-state.repository";
import { AcademyInvoiceSnapshotRepository } from "../infrastructure/academy-invoice-snapshot.repository";
import { AcademyPublishClient, INVOICE_SYNC_BATCH_SIZE } from "../infrastructure/academy-publish.client";

/** One run sends at most this many batches (2,000 invoices); the next run carries on. Keeps a first big backfill from hogging the worker. */
const MAX_BATCHES_PER_RUN = 20;
const LOCK_KEY = "academy:publish:lock";
const LOCK_TTL_SECONDS = 120;
const MAX_MESSAGE_LENGTH = 300;

export interface PublishRunResult {
  sent: number;
  created: number;
  updated: number;
  unchanged: number;
  stale: number;
  rejected: number;
  /** Set when the Academy could not be reached or answered with an error; the invoices stay pending and are retried. */
  error: string | null;
}

export interface PublishStatus {
  /** Whether this ERP is connected to its Academy school at all. */
  connected: boolean;
  enabled: boolean;
  pending: number;
  published: number;
  rejected: number;
  lastPublishAt: Date | null;
  lastPublishOk: boolean | null;
  lastPublishMessage: string | null;
  recentRejections: Array<{ invoiceNumber: string; reason: string; at: Date | null }>;
}

const emptyResult = (): PublishRunResult => ({ sent: 0, created: 0, updated: 0, unchanged: 0, stale: 0, rejected: 0, error: null });

/**
 * Sends the ERP's invoices to the Academy so parents can see them in the parent portal.
 *
 * The ERP is the only system that knows what a family owes; the portal only ever shows what this publishes. A parent
 * sees an invoice only if the ACADEMY says that parent is linked to that learner — the ERP does not decide who sees what,
 * it just says "this invoice belongs to Academy student X".
 *
 *  - Off by default: nothing leaves the ERP until an admin switches publishing on.
 *  - Only students that sync has linked to an Academy student, and only invoices that are real bills (posted onwards).
 *  - Every send is an idempotent upsert carrying `bill_invoice.version`; the Academy ignores anything not newer. So it does
 *    not matter if a send is repeated, reordered or lost: the periodic sweep (`publishPending`) re-sends whatever is
 *    still behind, and the outbox handlers only make the common cases (a new invoice, a payment) arrive sooner.
 *  - One run at a time (Redis lock), bounded size, and an Academy outage just leaves invoices pending.
 */
@Injectable()
export class AcademyPublishService {
  private readonly logger = new Logger(AcademyPublishService.name);

  constructor(
    @Inject(ACADEMY_LINK_PORT) private readonly academyLink: AcademyLinkPort,
    private readonly client: AcademyPublishClient,
    private readonly snapshots: AcademyInvoiceSnapshotRepository,
    private readonly stateRepository: AcadSyncStateRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getStatus(): Promise<PublishStatus> {
    const [connection, state, counts, recentRejections] = await Promise.all([
      this.academyLink.getConnection(),
      this.stateRepository.getOrCreate(),
      this.snapshots.counts(),
      this.snapshots.recentRejections(5),
    ]);
    return {
      connected: connection !== null,
      enabled: state.publishInvoicesEnabled,
      pending: counts.pending,
      published: counts.published,
      rejected: counts.rejected,
      lastPublishAt: state.lastPublishAt,
      lastPublishOk: state.lastPublishOk,
      lastPublishMessage: state.lastPublishMessage,
      recentRejections,
    };
  }

  async setEnabled(enabled: boolean, actorId: string | null): Promise<AcadSyncStateEntity> {
    if (enabled && !(await this.academyLink.getConnection())) {
      throw new ValidationException("This ERP is not connected to a Klickit Academy school yet. Connect it on the Licence page first.");
    }
    const state = await this.stateRepository.getOrCreate();
    state.publishInvoicesEnabled = enabled;
    state.updatedBy = actorId;
    return this.stateRepository.save(state);
  }

  /**
   * Sends whatever is behind. `null` when publishing is off, the ERP is not connected, or another run holds the lock.
   * With `studentId`, only that student's invoices (what the outbox handlers use after an invoice or a payment).
   */
  async publishPending(options: { studentId?: string; maxBatches?: number } = {}): Promise<PublishRunResult | null> {
    const state = await this.stateRepository.getOrCreate();
    if (!state.publishInvoicesEnabled) {
      return null;
    }
    const connection = await this.academyLink.getConnection();
    if (!connection) {
      return null;
    }

    const token = randomUUID();
    if ((await this.redis.set(LOCK_KEY, token, "EX", LOCK_TTL_SECONDS, "NX")) !== "OK") {
      return null;
    }

    const result = emptyResult();
    try {
      const maxBatches = options.maxBatches ?? MAX_BATCHES_PER_RUN;
      for (let batch = 0; batch < maxBatches; batch++) {
        const invoices = await this.snapshots.findPending(INVOICE_SYNC_BATCH_SIZE, options.studentId);
        if (invoices.length === 0) {
          break;
        }

        let reply;
        try {
          reply = await this.client.syncInvoices(connection.apiKey, invoices);
        } catch (error) {
          // The Academy is unreachable or errored: leave everything pending (no per-invoice blame) and try again next run.
          result.error = (error instanceof Error ? error.message : String(error)).slice(0, MAX_MESSAGE_LENGTH);
          this.logger.warn(`Publishing invoices to the Academy failed: ${result.error}`);
          break;
        }

        const progressed = await this.recordResults(invoices, reply.results ?? [], result);
        result.sent += invoices.length;
        await this.redis.expire(LOCK_KEY, LOCK_TTL_SECONDS);
        if (!progressed) {
          break; // nothing in this batch moved (all rejected): stop, the back-off keeps them out of the next query
        }
        if (invoices.length < INVOICE_SYNC_BATCH_SIZE) {
          break;
        }
      }
    } finally {
      await this.release(token);
    }

    if (result.sent > 0 || result.error) {
      await this.recordRun(result, options.studentId === undefined);
    }
    return result;
  }

  /** `false` when not a single invoice of the batch was accepted — the caller stops rather than loop on the same rows. */
  private async recordResults(
    sent: Array<{ erpInvoiceId: string; version: number }>,
    results: Array<{ erpInvoiceId: string; outcome: string; reason?: string }>,
    totals: PublishRunResult,
  ): Promise<boolean> {
    const byId = new Map(results.map((entry) => [entry.erpInvoiceId, entry]));
    let accepted = 0;
    for (const invoice of sent) {
      const outcome = byId.get(invoice.erpInvoiceId);
      switch (outcome?.outcome) {
        case "CREATED":
          totals.created++;
          break;
        case "UPDATED":
          totals.updated++;
          break;
        case "UNCHANGED":
          totals.unchanged++;
          break;
        case "STALE":
          totals.stale++;
          break;
        default: {
          // REJECTED, or not mentioned at all: never assume it arrived.
          totals.rejected++;
          await this.snapshots.markRejected(invoice.erpInvoiceId, outcome?.reason ?? "The Academy did not confirm this invoice.");
          continue;
        }
      }
      accepted++;
      await this.snapshots.markPublished(invoice.erpInvoiceId, invoice.version);
    }
    return accepted > 0;
  }

  private async recordRun(result: PublishRunResult, isSweep: boolean): Promise<void> {
    const ok = result.error === null && result.rejected === 0;
    const message = result.error
      ? result.error
      : `Sent ${result.sent}: ${result.created} new, ${result.updated} updated, ${result.unchanged + result.stale} already up to date${result.rejected ? `, ${result.rejected} not accepted` : ""}.`;
    // A one-student publish after an event should not overwrite the headline result of the last full sweep with a tiny one.
    if (!isSweep && ok) {
      return;
    }
    const state = await this.stateRepository.getOrCreate();
    state.lastPublishAt = new Date();
    state.lastPublishOk = ok;
    state.lastPublishMessage = message.slice(0, MAX_MESSAGE_LENGTH);
    await this.stateRepository.save(state);
  }

  /** Releases the lock only if it is still ours (it may have expired and been taken by another run). */
  private async release(token: string): Promise<void> {
    await this.redis.eval(`if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`, 1, LOCK_KEY, token);
  }
}
