import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { AcademicCalendarService } from "../../../platform/settings";
import { BillFeeCategoryRepository } from "../infrastructure/bill-fee-category.repository";
import { BillTransportRouteRepository } from "../infrastructure/bill-transport-route.repository";
import { BillInvoiceLineRepository } from "../infrastructure/bill-invoice-line.repository";
import { BillTransportBillingLineRepository } from "../infrastructure/bill-transport-billing-line.repository";
import { InvoicingService } from "./invoicing.service";

/**
 * Migration `0245`'s idempotent seed (mirroring `LATE_FEE_INCOME_CATEGORY_NAME`'s
 * own exact pattern) upserts a `bill_fee_category` row with this name,
 * pointed at the already-seeded `4030 Other Income` GL leaf — no dedicated
 * income account is minted, same judgement call `LateFeeBatchesService`/
 * `ChequesService.bounce()` already made for their own designated categories.
 */
export const TRANSPORT_FEE_INCOME_CATEGORY_NAME = "Transport Fee";

export interface BillTransportInput {
  routeId: string;
  termId: string;
  studentIds: string[];
  issueDate?: string;
}

export interface BillTransportSuccess {
  studentId: string;
  invoiceIds: string[];
}

export interface BillTransportFailure {
  studentId: string;
  error: string;
}

export interface BillTransportResult {
  succeeded: BillTransportSuccess[];
  failed: BillTransportFailure[];
}

export interface RegenerateTransportFilter {
  routeId?: string;
}

export interface TransportRegenerateSuccess {
  studentId: string;
  invoiceIds: string[];
  routeId: string;
}

/** Not an error — no qualifying prior-term transport billing to carry forward, or already billed for transport this term. */
export interface TransportRegenerateSkip {
  studentId: string;
  reason: string;
}

export interface TransportRegenerateResult {
  succeeded: TransportRegenerateSuccess[];
  failed: BillTransportFailure[];
  skipped: TransportRegenerateSkip[];
}

/** `regenerateLikePreviousTerm()`'s own internal per-student result — same "return, don't throw, for a normal skip" reasoning as `BulkBillingService`'s identically-shaped internal result. */
type RegenerateForStudentResult =
  | { kind: "generated"; invoiceIds: string[]; routeId: string }
  | { kind: "skipped"; reason: string };

/**
 * Phase 6 (Transport Routes enhancement) — bills a `bill_transport_route`'s
 * own flat `amount` to a caller-selected list of students for one term, via
 * the ADHOC invoice path. `billStudents()` mirrors `BulkAdhocInvoicesService.bulkGenerate()`'s
 * exact shape: one `runInTransaction` PER STUDENT, a failure on one student
 * never aborts the batch, `{succeeded, failed}` result (no `skipped[]` in
 * THAT method — unlike ad-hoc category billing, there is no duplicate-fee-
 * category guard for transport fees billed this way; re-billing the same
 * student for the same route/term is allowed, matching how
 * `LateFeeBatchesService`/`DebitNotesService` both call
 * `InvoicingService.generateInvoice()` directly with no such guard).
 * `regenerateLikePreviousTerm()` (see its own doc comment below) is a
 * SEPARATE, later-added algorithm on this same class and DOES have a
 * duplicate guard, plus a genuine `skipped[]` bucket.
 *
 * Per student: builds exactly ONE `adhocLines` entry (the route's own flat
 * `amount`, tagged to the designated `TRANSPORT_FEE_INCOME_CATEGORY_NAME`
 * category), calls `generateInvoice()`+`postInvoice()` — the same two-call
 * pattern every ADHOC caller in this codebase uses, no posting logic
 * duplicated here — then records one `bill_transport_billing_line` row per
 * resulting invoice line, tagging it to the route for later income
 * summation (`TransportRoutesController`'s `.../summary` route).
 *
 * The response shape (`{succeeded:[{studentId,invoiceIds}], failed:[...]}`)
 * deliberately matches `BulkAdhocGenerateResult`'s own shape so the
 * frontend's wallet-sweep/credit-balance-apply collection loops (already
 * built for the ad-hoc bulk form) need zero adaptation to work against this
 * endpoint's result too.
 */
@Injectable()
export class TransportBillingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transportRouteRepository: BillTransportRouteRepository,
    private readonly feeCategoryRepository: BillFeeCategoryRepository,
    private readonly invoicingService: InvoicingService,
    private readonly billInvoiceLineRepository: BillInvoiceLineRepository,
    private readonly billingLineRepository: BillTransportBillingLineRepository,
    private readonly academicCalendarService: AcademicCalendarService,
  ) {}

  async billStudents(input: BillTransportInput, initiatedBy: string): Promise<BillTransportResult> {
    const route = await this.transportRouteRepository.findByIdOrFail(input.routeId);
    const category = await this.feeCategoryRepository.findByName(TRANSPORT_FEE_INCOME_CATEGORY_NAME);
    if (!category) {
      throw new NotFoundException(
        "BillFeeCategory",
        `${TRANSPORT_FEE_INCOME_CATEGORY_NAME} — expected migration 0245 to have upserted it`,
      );
    }

    const succeeded: BillTransportSuccess[] = [];
    const failed: BillTransportFailure[] = [];

    for (const studentId of input.studentIds) {
      try {
        const invoiceIds = await runInTransaction(this.dataSource, (manager) =>
          this.billOneStudent(manager, studentId, route.id, route.name, route.amount, category.id, input.termId, input.issueDate, initiatedBy),
        );
        succeeded.push({ studentId, invoiceIds });
      } catch (error) {
        failed.push({ studentId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { succeeded, failed };
  }

  private async billOneStudent(
    manager: EntityManager,
    studentId: string,
    routeId: string,
    routeName: string,
    routeAmount: Money,
    feeCategoryId: string,
    termId: string,
    issueDate: string | undefined,
    initiatedBy: string,
  ): Promise<string[]> {
    const invoice = await this.invoicingService.generateInvoice(manager, {
      studentId,
      termId,
      source: "ADHOC",
      adhocLines: [
        {
          feeCategoryId,
          description: `Transport fee — ${routeName}`,
          amount: routeAmount,
        },
      ],
      issueDate,
      createdBy: initiatedBy,
    });
    await this.invoicingService.postInvoice(manager, invoice.id, initiatedBy);

    const lines = await this.billInvoiceLineRepository.listByInvoice(invoice.id, manager);
    for (const line of lines) {
      await this.billingLineRepository.create(
        { routeId, invoiceLineId: line.id, studentId },
        manager,
      );
    }

    return [invoice.id];
  }

  /**
   * "Regenerate" (like previous term) — the Transport counterpart to
   * `BulkBillingService.bulkGenerate()`'s own "carry forward" redesign
   * (Slice 49). Transport has no fee-structure/version concept, so "carry
   * forward categories" degenerates to "carry forward the route": for every
   * student who had a real (non-VOID) transport billing line in the term
   * immediately preceding `termId` (same academic year, `seq - 1`, no
   * cross-year fallback — same rule Bulk Billing uses), this regenerates a
   * new invoice for `termId` on that SAME route, priced at the route's
   * CURRENT `amount` — never the prior invoice's own amount. `filter.routeId`
   * optionally narrows the preceding term's population to one route.
   *
   * Uses `source: "CARRIED_FORWARD"` (migration `0253`) via the exact same
   * generic `adhocLines` branch of `InvoicingService.generateInvoice()`
   * `billOneStudent()` above already uses for `source: "ADHOC"` — zero
   * engine changes needed. Deliberately a separate private helper
   * (`regenerateOneStudent()`) rather than reusing `billOneStudent()`
   * directly — the source value and description text differ, and keeping
   * them independent avoids threading extra parameters through the
   * existing, already-shipped "Bill Transport" path for a concern
   * (carry-forward) it was never designed to have.
   *
   * Duplicate guard: unlike `billStudents()` (no guard at all, matching
   * `LateFeeBatchesService`/`DebitNotesService`'s own precedent), this path
   * DOES skip a student who already has a real transport billing line for
   * the TARGET term — an application-level check via the same
   * `listByTermAndOptionalRoute()` lookup, since `CARRIED_FORWARD`'s
   * `fee_structure_id` is always null (same as `ADHOC`) so no DB-level
   * `uq_bill_invoice_structure_p` constraint applies here either.
   *
   * The "no preceding term" case (target term is `seq=1`, or its `seq-1`
   * row genuinely doesn't exist) is checked ONCE up front, before touching
   * any student, and rejects the whole request with a clean 404 — identical
   * shape to `BulkBillingService.bulkGenerate()`'s own up-front check.
   */
  async regenerateLikePreviousTerm(
    termId: string,
    filter: RegenerateTransportFilter,
    initiatedBy: string,
  ): Promise<TransportRegenerateResult> {
    const targetTerm = await this.academicCalendarService.findTermByIdOrFail(termId);
    const precedingTerm = await this.academicCalendarService.findTermByYearAndSeq(
      targetTerm.academicYearId,
      targetTerm.seq - 1,
    );
    if (!precedingTerm) {
      throw new NotFoundException(
        "SetTerm(preceding)",
        `no term with seq=${targetTerm.seq - 1} exists in academic year ${targetTerm.academicYearId} — term "${targetTerm.name}" (seq ${targetTerm.seq}) has no preceding term to carry forward transport billing from`,
      );
    }

    const priorRows = await this.billingLineRepository.listByTermAndOptionalRoute(precedingTerm.id, filter.routeId);
    // Most recent row per student wins — mirrors BulkBillingService's own "most recent non-VOID invoice" discipline.
    const mostRecentByStudent = new Map<string, { routeId: string; createdAt: Date }>();
    for (const row of priorRows) {
      const existing = mostRecentByStudent.get(row.studentId);
      if (!existing || row.createdAt > existing.createdAt) {
        mostRecentByStudent.set(row.studentId, { routeId: row.routeId, createdAt: row.createdAt });
      }
    }
    const priorRouteByStudent = new Map<string, string>(
      [...mostRecentByStudent].map(([studentId, { routeId }]) => [studentId, routeId]),
    );

    const targetRows = await this.billingLineRepository.listByTermAndOptionalRoute(termId, undefined);
    const alreadyBilledStudents = new Set(targetRows.map((row) => row.studentId));

    const category = await this.feeCategoryRepository.findByName(TRANSPORT_FEE_INCOME_CATEGORY_NAME);
    if (!category) {
      throw new NotFoundException(
        "BillFeeCategory",
        `${TRANSPORT_FEE_INCOME_CATEGORY_NAME} — expected migration 0245 to have upserted it`,
      );
    }

    const succeeded: TransportRegenerateSuccess[] = [];
    const failed: BillTransportFailure[] = [];
    const skipped: TransportRegenerateSkip[] = [];

    for (const [studentId, routeId] of priorRouteByStudent) {
      try {
        const result = await runInTransaction(this.dataSource, (manager) =>
          this.regenerateOneStudent(manager, studentId, routeId, category.id, termId, alreadyBilledStudents, initiatedBy),
        );
        if (result.kind === "skipped") {
          skipped.push({ studentId, reason: result.reason });
        } else {
          succeeded.push({ studentId, invoiceIds: result.invoiceIds, routeId: result.routeId });
        }
      } catch (error) {
        failed.push({ studentId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { succeeded, failed, skipped };
  }

  private async regenerateOneStudent(
    manager: EntityManager,
    studentId: string,
    routeId: string,
    feeCategoryId: string,
    termId: string,
    alreadyBilledStudents: Set<string>,
    initiatedBy: string,
  ): Promise<RegenerateForStudentResult> {
    if (alreadyBilledStudents.has(studentId)) {
      return { kind: "skipped", reason: "already billed for transport this term" };
    }

    const route = await this.transportRouteRepository.findByIdOrFail(routeId, manager);

    const invoice = await this.invoicingService.generateInvoice(manager, {
      studentId,
      termId,
      source: "CARRIED_FORWARD",
      adhocLines: [
        {
          feeCategoryId,
          description: `Transport fee — ${route.name} (carried forward)`,
          amount: route.amount,
        },
      ],
      createdBy: initiatedBy,
    });
    await this.invoicingService.postInvoice(manager, invoice.id, initiatedBy);

    const lines = await this.billInvoiceLineRepository.listByInvoice(invoice.id, manager);
    for (const line of lines) {
      await this.billingLineRepository.create({ routeId, invoiceLineId: line.id, studentId }, manager);
    }

    return { kind: "generated", invoiceIds: [invoice.id], routeId };
  }
}
