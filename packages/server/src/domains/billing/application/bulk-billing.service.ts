import { Inject, Injectable, Optional } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { NOTIFICATION_SINK, type NotificationSink } from "../../../shared/notifications/notification-sink.port";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { AcademicCalendarService } from "../../../platform/settings";
// Barrel import (a pure application-layer service dependency, not an entity
// file) — safe, see billing.module.ts's own doc comment on import ordering.
import { StdStudentRepository } from "../../students";
import { BillFeeCategoryEntity } from "../domain/bill-fee-category.entity";
import { BillFeeStructureLineEntity } from "../domain/bill-fee-structure-line.entity";
import { BillFeeCategoryRepository } from "../infrastructure/bill-fee-category.repository";
import { BillFeeStructureLineRepository } from "../infrastructure/bill-fee-structure-line.repository";
import { BillInvoiceLineRepository } from "../infrastructure/bill-invoice-line.repository";
import { BillInvoiceRepository } from "../infrastructure/bill-invoice.repository";
import { FeeStructuresService } from "./fee-structures.service";
import { InvoicingService } from "./invoicing.service";
import { formatStudentLabel } from "./student-label";

export interface BulkGenerateFilter {
  classIds?: string[];
  streamIds?: string[];
}

export interface BulkGenerateSuccess {
  studentId: string;
  invoiceIds: string[];
  /** The carried-forward fee categories actually billed. */
  categoryIds: string[];
  /** Set (and non-empty) only on a PARTIAL skip — see `BulkGenerateSkip`'s own doc comment. */
  alreadyBilledCategoryIds?: string[];
}

export interface BulkGenerateFailure {
  studentId: string;
  /** "First Last (admission no.)" — see `formatStudentLabel()`. Optional so the UI can fall back to the id. */
  studentLabel?: string;
  error: string;
}

/**
 * A student for whom NOTHING was generated, but it's not an error — either
 * they have no qualifying prior-term invoice to carry forward at all, or
 * every one of their carried-forward categories was already really billed
 * this term. Kept out of `failed[]` for the same reason
 * `BulkAdhocInvoicesService`'s own `BulkAdhocGenerateSkip` is: this is a
 * normal, expected outcome the accountant should see distinctly from a real
 * failure.
 */
export interface BulkGenerateSkip {
  studentId: string;
  /** "First Last (admission no.)" — see `formatStudentLabel()`. Optional so the UI can fall back to the id. */
  studentLabel?: string;
  reason: string;
}

export interface BulkGenerateResult {
  succeeded: BulkGenerateSuccess[];
  failed: BulkGenerateFailure[];
  skipped: BulkGenerateSkip[];
}

/** `generateForStudent()`'s own internal result — see `BulkAdhocInvoicesService`'s identically-shaped `GenerateForStudentResult` for the same "return, don't throw, for a normal skip" reasoning. */
type GenerateForStudentResult =
  | { kind: "generated"; invoiceIds: string[]; categoryIds: string[]; alreadyBilledCategoryIds: string[] }
  | { kind: "skipped"; reason: string };

/**
 * Bulk Billing, redesigned (2026-09-04) as "regenerate like previous term":
 * an accountant no longer picks a fee structure or fee categories here at
 * all. For each ACTIVE student matching `filter.classIds`/`.streamIds` (an
 * empty filter means every active student, same as before), this service
 * finds that student's own most recent NON-VOID invoice from the term
 * IMMEDIATELY PRECEDING the target term (same academic year, `seq - 1` —
 * NO cross-academic-year fallback), reads which fee categories it actually
 * billed, and generates a NEW invoice for the target term carrying forward
 * that same category set — but priced at the CURRENT PUBLISHED fee
 * structure's amount for each category/term, never the prior invoice's own
 * peso amount. This replaces the old fee-structure-driven algorithm
 * entirely (which was redundant with normal invoice generation whenever
 * nothing had actually changed, and couldn't reproduce a student's real
 * billed pattern anyway — the everyday per-student invoicing screen hasn't
 * used the fee-structure engine directly in a long time, it lets
 * accountants hand-pick categories via `BulkAdhocInvoicesService`'s ADHOC
 * path, so a real invoice can legitimately diverge from what the structure
 * alone would produce).
 *
 * Generated via `InvoicingService.generateInvoice()`'s existing generic
 * `adhocLines` branch (`source: "CARRIED_FORWARD"`, migration `0253`) — that
 * method needed ZERO changes for this feature. `postInvoice()` is fully
 * source-agnostic too.
 *
 * **Deliberately does NOT share code with `BulkAdhocInvoicesService`**, even
 * though its own `generateForStudent()` is the closest existing precedent
 * for this method's per-student mechanics (resolve applicable structure ->
 * get lines for term -> filter by category set -> apply the already-billed
 * guard -> group by due date -> generate+post per group). That method
 * SILENTLY DROPS any selected category absent from the structure, erroring
 * only if ZERO match — this feature needs the OPPOSITE strictness: if ANY
 * carried-forward category is missing from the CURRENT structure, the whole
 * student must fail loudly, naming the missing category, rather than
 * silently generating a partial invoice (a real product decision, not an
 * oversight — a partial re-bill would silently under-charge a family
 * relative to what they were actually billed last term). Threading a
 * strictness flag through an already-shipped, independent feature for reuse
 * of ~40 lines of glue was judged not worth the coupling risk; the
 * duplicate-billing guard itself (`BillInvoiceLineRepository.
 * listAlreadyBilledCategoryIds()`) IS still reused directly, since its
 * semantics are identical in both cases.
 *
 * Same partial-failure-tolerant, one-transaction-PER-STUDENT shape every
 * other batch service in this module uses — one student's failure never
 * aborts the batch, and re-running the same scope is naturally idempotent
 * (already-billed categories are skipped, never re-billed) even though
 * `CARRIED_FORWARD` has no DB-level uniqueness constraint backing it (see
 * `bill-invoice.entity.ts`'s own doc comment for why one doesn't apply
 * here).
 */
@Injectable()
export class BulkBillingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly studentRepository: StdStudentRepository,
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly invoiceLineRepository: BillInvoiceLineRepository,
    private readonly feeStructureLineRepository: BillFeeStructureLineRepository,
    private readonly feeCategoryRepository: BillFeeCategoryRepository,
    private readonly feeStructuresService: FeeStructuresService,
    private readonly academicCalendarService: AcademicCalendarService,
    private readonly invoicingService: InvoicingService,
    /** Tells whoever started the run how it went (the bell). */
    @Optional() @Inject(NOTIFICATION_SINK) private readonly notifications?: NotificationSink,
  ) {}

  async bulkGenerate(termId: string, filter: BulkGenerateFilter, initiatedBy: string): Promise<BulkGenerateResult> {
    const targetTerm = await this.academicCalendarService.findTermByIdOrFail(termId);
    const precedingTerm = await this.academicCalendarService.findTermByYearAndSeq(
      targetTerm.academicYearId,
      targetTerm.seq - 1,
    );
    if (!precedingTerm) {
      // A request-level failure, checked BEFORE resolveStudents()/any
      // transaction — a structural precondition of the whole run, not a
      // per-student concern. NotFoundException, not ValidationException:
      // this IS a real repository lookup that resolved to nothing (whether
      // because seq=1 mathematically has no predecessor, or a seq-1 row was
      // simply never created — both surface identically as "no row found"),
      // matching this codebase's own NotFoundException/ValidationException
      // split (see generateInvoice()'s own findApplicableFor() precedent).
      throw new NotFoundException(
        // Shown verbatim to the accountant: names the term, never an academic-year id or "seq=" internals.
        "Preceding term",
        `${targetTerm.name} has no earlier term in its academic year, so there are no invoices to carry forward from`,
      );
    }

    const students = await this.resolveStudents(filter);
    const succeeded: BulkGenerateSuccess[] = [];
    const failed: BulkGenerateFailure[] = [];
    const skipped: BulkGenerateSkip[] = [];

    for (const student of students) {
      // The rows are already loaded (`resolveStudents()`), so labelling failures/skips
      // with the student's name costs no extra query.
      const studentLabel = formatStudentLabel(student);
      try {
        const result = await runInTransaction(this.dataSource, (manager) =>
          this.generateForStudent(
            manager,
            student.id,
            termId,
            precedingTerm.id,
            { target: targetTerm.name, preceding: precedingTerm.name },
            initiatedBy,
          ),
        );
        if (result.kind === "skipped") {
          skipped.push({ studentId: student.id, studentLabel, reason: result.reason });
        } else {
          succeeded.push({
            studentId: student.id,
            invoiceIds: result.invoiceIds,
            categoryIds: result.categoryIds,
            ...(result.alreadyBilledCategoryIds.length > 0
              ? { alreadyBilledCategoryIds: result.alreadyBilledCategoryIds }
              : {}),
          });
        }
      } catch (error) {
        failed.push({ studentId: student.id, studentLabel, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // The person who started it is told the outcome (created / skipped / failed), whatever the size of the run.
    await this.notifications?.emit({
      code: "BULK_BILLING_DONE",
      params: { term: targetTerm.name, created: succeeded.length, skipped: skipped.length, failed: failed.length },
      link: "/billing/bulk-billing",
      entityType: "set_term",
      entityId: termId,
      userIds: [initiatedBy],
    });

    return { succeeded, failed, skipped };
  }

  private async generateForStudent(
    manager: EntityManager,
    studentId: string,
    targetTermId: string,
    precedingTermId: string,
    // Display names for the failure messages below — they are shown verbatim to the
    // accountant, next to the student's name, so they must name terms, never ids.
    termNames: { target: string; preceding: string },
    initiatedBy: string,
  ): Promise<GenerateForStudentResult> {
    const priorInvoice = await this.invoiceRepository.findMostRecentNonVoidByStudentAndTerm(
      studentId,
      precedingTermId,
      manager,
    );
    if (!priorInvoice) {
      return { kind: "skipped", reason: "no non-VOID invoice found for this student in the preceding term" };
    }

    const priorLines = await this.invoiceLineRepository.listByInvoice(priorInvoice.id, manager);
    const priorCategoryIds = [...new Set(priorLines.map((line) => line.feeCategoryId))];

    const structure = await this.feeStructuresService.findApplicableFor(studentId, targetTermId, manager);
    if (!structure) {
      throw new ValidationException(
        `No published fee structure applies to this student for ${termNames.target} (BR-BILL-02) — publish one for their class and academic year first`,
      );
    }

    const currentLines = await this.feeStructureLineRepository.listByStructureAndTerm(structure.id, targetTermId, manager);
    const currentByCategory = new Map(currentLines.map((line) => [line.feeCategoryId, line]));

    // Strict match (a deliberate product decision, see class doc comment):
    // every category the student was ACTUALLY billed last term must still
    // exist on the current structure, or this student fails loudly rather
    // than silently getting a partial re-bill.
    const missingCategoryIds = priorCategoryIds.filter((id) => !currentByCategory.has(id));
    if (missingCategoryIds.length > 0) {
      const missingNames = await Promise.all(
        missingCategoryIds.map(async (id) => (await this.feeCategoryRepository.findByIdOrFail(id, manager)).name),
      );
      throw new ValidationException(
        `This student's most recent invoice (${priorInvoice.number}) from ${termNames.preceding} billed categories that are no longer on the ${termNames.target} fee structure: ${missingNames.join(", ")}`,
      );
    }

    const matchedLines: BillFeeStructureLineEntity[] = priorCategoryIds.map((id) => currentByCategory.get(id)!);

    // Same reused application-level duplicate-billing guard `BulkAdhocInvoicesService` relies on for ADHOC.
    const alreadyBilledSet = await this.invoiceLineRepository.listAlreadyBilledCategoryIds(
      studentId,
      targetTermId,
      priorCategoryIds,
      manager,
    );
    const alreadyBilledCategoryIds = [...alreadyBilledSet];
    const billableLines = matchedLines.filter((line) => !alreadyBilledSet.has(line.feeCategoryId));

    if (billableLines.length === 0) {
      return { kind: "skipped", reason: "every carried-forward category is already billed for this term" };
    }

    // Group by each CURRENT line's own due date — a student whose
    // carried-forward categories now fall on different due dates on the
    // current structure legitimately gets one invoice per due-date group,
    // same mechanics as BulkAdhocInvoicesService.generateForStudent().
    const groupsByDueDate = new Map<string, BillFeeStructureLineEntity[]>();
    for (const line of billableLines) {
      const group = groupsByDueDate.get(line.dueDate);
      if (group) {
        group.push(line);
      } else {
        groupsByDueDate.set(line.dueDate, [line]);
      }
    }

    const categoryCache = new Map<string, BillFeeCategoryEntity>();
    const categoryFor = async (id: string): Promise<BillFeeCategoryEntity> => {
      const cached = categoryCache.get(id);
      if (cached) return cached;
      const category = await this.feeCategoryRepository.findByIdOrFail(id, manager);
      categoryCache.set(id, category);
      return category;
    };

    const invoiceIds: string[] = [];
    for (const [dueDate, lines] of groupsByDueDate) {
      const adhocLines = await Promise.all(
        lines.map(async (line) => {
          const category = await categoryFor(line.feeCategoryId);
          // CURRENT amount, never the prior invoice's own peso amount.
          return { feeCategoryId: line.feeCategoryId, description: category.name, amount: line.amount };
        }),
      );
      const invoice = await this.invoicingService.generateInvoice(manager, {
        studentId,
        termId: targetTermId,
        source: "CARRIED_FORWARD",
        adhocLines,
        dueDate,
        createdBy: initiatedBy,
      });
      await this.invoicingService.postInvoice(manager, invoice.id, initiatedBy);
      invoiceIds.push(invoice.id);
    }

    return { kind: "generated", invoiceIds, categoryIds: priorCategoryIds, alreadyBilledCategoryIds };
  }

  /**
   * Phase 6 Slice 2c — `StdStudentRepository.list()` returns `[items, total]`
   * (real server-side pagination for `StudentsController`'s list endpoint) —
   * every call site here omits `skip`/`take`, so the row SET returned is
   * unchanged (still every matching row, unbounded), only the return SHAPE
   * changed from a plain array to a tuple; `total` is discarded here, this
   * method only ever wanted the rows. Kept byte-for-byte from the old
   * algorithm — population resolution is unchanged by this redesign.
   */
  private async resolveStudents(
    filter: BulkGenerateFilter,
  ): Promise<{ id: string; streamId: string | null; firstName: string; lastName: string; admissionNo: string }[]> {
    const classIds = filter.classIds ?? [];
    const streamIds = filter.streamIds ?? [];

    if (classIds.length > 0) {
      const rowsByClass = await Promise.all(
        classIds.map((classId) => this.studentRepository.list({ classId, status: "ACTIVE" })),
      );
      const rows = rowsByClass.flatMap(([items]) => items);
      return streamIds.length > 0 ? rows.filter((row) => row.streamId && streamIds.includes(row.streamId)) : rows;
    }

    if (streamIds.length > 0) {
      const rowsByStream = await Promise.all(
        streamIds.map((streamId) => this.studentRepository.list({ streamId, status: "ACTIVE" })),
      );
      return rowsByStream.flatMap(([items]) => items);
    }

    const [items] = await this.studentRepository.list({ status: "ACTIVE" });
    return items;
  }
}
