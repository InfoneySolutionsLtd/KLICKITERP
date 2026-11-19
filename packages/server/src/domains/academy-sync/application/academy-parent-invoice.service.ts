import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { NotifyService } from "../../../platform/notifications";
import { AcademicCalendarService, SettingsService } from "../../../platform/settings";
import { runInTransaction } from "../../../shared/database/tx";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import {
  BillFeeCategoryRepository,
  BillFeeStructureLineRepository,
  BillInvoiceLineRepository,
  BillStudentOptionalItemRepository,
  BillTransportRouteRepository,
  FeeStructuresService,
  InvoicingService,
  TransportBillingService,
} from "../../billing";
import { MPESA_SYSTEM_ACTOR_SETTING_KEY } from "../../payments";
import type { ParentInvoiceSelection } from "../domain/acad-parent-invoice-request.entity";
import {
  AcadParentInvoiceRequestRepository,
  type InvoiceBrief,
  type LinkedStudent,
  type ParentInvoiceRequestRow,
} from "../infrastructure/acad-parent-invoice-request.repository";
import { AcadSyncStateRepository } from "../infrastructure/acad-sync-state.repository";
import { AcademyPublishService } from "./academy-publish.service";
import {
  checkChoice,
  formatKes,
  latestDate,
  PARENT_INVOICE_ACTOR_SETTING_KEY,
  PARENT_INVOICE_NOTIFICATION_TYPE,
  PARENT_INVOICE_NOTIFY_FALLBACK_PERMISSION,
  PARENT_INVOICE_REFUSALS,
  ParentInvoiceRefusal,
  planTerm,
  sumDecimalStrings,
  type ParentInvoiceChoice,
  type ParentInvoiceMode,
  type ParentInvoiceRefusalCode,
  type TermLine,
  type TermPlan,
} from "./academy-parent-invoice.util";

export interface FeeOptionLineView {
  categoryId: string;
  name: string;
  /** Decimal string, 4 places — straight from the school's fee structure; a parent can never set it. */
  amount: string;
  dueDate: string;
}

export interface TransportRouteView {
  routeId: string;
  name: string;
  amount: string;
}

export interface TermFeeOptionsView {
  termId: string;
  name: string;
  isCurrent: boolean;
  startsOn: string;
  endsOn: string;
  mode: ParentInvoiceMode;
  /** FULL only: what the invoice carries whatever the parent chooses. */
  included: FeeOptionLineView[];
  /** Optional items the parent may tick. */
  optional: FeeOptionLineView[];
  /** Routes the parent may pick; empty when transport is already billed for the term or none is active. */
  transportRoutes: TransportRouteView[];
  transportAlreadyBilled: boolean;
}

export interface ParentFeeOptionsView {
  /** False when the school has not switched this on (or has not finished setting it up): the parent portal shows nothing. */
  available: boolean;
  message: string | null;
  terms: TermFeeOptionsView[];
}

export interface CreateParentInvoiceInput {
  /** The Academy's own id for this request — what makes the call safe to repeat. */
  requestId: string;
  academyStudentId: string;
  termId: string;
  optionalCategoryIds: string[];
  routeId?: string | null;
  /** The signed-in parent's name, as the Academy verified it. For the notification only. */
  parentName?: string | null;
}

export interface ParentInvoiceView {
  invoiceId: string;
  number: string;
  kind: "FEE" | "TRANSPORT";
  /** Decimal string, 4 places, AFTER any concession the school's rules applied when posting. */
  total: string;
  dueDate: string;
}

export interface ParentInvoiceRequestView {
  requestId: string;
  status: "CREATED" | "REFUSED" | "PENDING";
  code: string | null;
  message: string | null;
  mode: ParentInvoiceMode | null;
  invoices: ParentInvoiceView[];
  /** Sum of `invoices[].total`. */
  total: string;
}

/** Which user parent-generated invoices are recorded under, and where that came from. */
export interface ParentInvoiceActorStatus {
  /** True when a user is set AND is active: the feature can create invoices. */
  configured: boolean;
  /** `PARENT_INVOICES` = this feature's own setting; `MPESA` = the existing M-Pesa system cashier, used as the fallback. */
  source: "PARENT_INVOICES" | "MPESA" | null;
  userId: string | null;
  userName: string | null;
  /** False when a user id is saved but that user is missing or not active. */
  userActive: boolean;
}

export interface ParentInvoicingReadiness {
  /** Issues that stop parents from using the feature (or that the school should know about). */
  issues: Array<"NOT_CONNECTED" | "PUBLISHING_OFF" | "NO_SYSTEM_USER">;
}

/** `acad_parent_invoice_request.academy_student_id` is `varchar(64)`; the Academy's ids are UUIDs, so anything longer is not one of theirs. */
const MAX_ACADEMY_STUDENT_ID_LENGTH = 64;

interface TermRef {
  id: string;
  name: string;
  isCurrent: boolean;
  startsOn: string;
  endsOn: string;
}

interface BuiltTerm {
  plan: TermPlan | null;
  /** Every due date of the term's fee lines — transport falls due with them. */
  allLines: TermLine[];
}

type Gate = { ok: true; actorUserId: string } | { ok: false; code: "FEATURE_OFF" | "NOT_READY" };

/**
 * Parents customise and generate their own fee invoices from the Academy parent portal.
 *
 * Who may do what is decided here, in the books, every time — the parent portal only draws what this says:
 *  - **Only what the school marked optional, plus transport.** A parent can never change a mandatory line, an amount or a
 *    date. They send category ids and a route id; every amount comes from the school's fee structure and route.
 *  - **One term at a time** from the current academic year (terms already over are not offered), for a learner the Academy
 *    named and this ERP has linked (`FeeOptions`/`create` trust the signed call for WHO the parent is, and check the books).
 *  - **No double billing.** `FULL` (nothing of the term billed yet) makes the term's whole fee invoice through the same
 *    billing engine the school uses; `TOP_UP` (something already billed) only adds optional items that are not billed yet
 *    and/or transport, as a small extra invoice. See `planTerm`.
 *  - **All or nothing.** The fee invoice, the transport invoice and the request record are created in ONE transaction,
 *    under a lock per learner and term, after the choice is re-checked against the books as they are now.
 *  - **Safe to repeat.** The Academy's request id is recorded first (unique): a retry or a double tap reports on the first
 *    answer and never creates a second invoice.
 *  - **Posted at once**, so the parent can pay and the portal can show it. A parent cannot delete it: voiding is a staff
 *    action. Accounts staff are notified afterwards (best effort: a notification problem never undoes an invoice).
 */
@Injectable()
export class AcademyParentInvoiceService {
  private readonly logger = new Logger(AcademyParentInvoiceService.name);

  constructor(
    private readonly repository: AcadParentInvoiceRequestRepository,
    private readonly stateRepository: AcadSyncStateRepository,
    private readonly settingsService: SettingsService,
    private readonly calendar: AcademicCalendarService,
    private readonly feeStructures: FeeStructuresService,
    private readonly structureLines: BillFeeStructureLineRepository,
    private readonly categories: BillFeeCategoryRepository,
    private readonly optionalItems: BillStudentOptionalItemRepository,
    private readonly invoiceLines: BillInvoiceLineRepository,
    private readonly routes: BillTransportRouteRepository,
    private readonly invoicing: InvoicingService,
    private readonly transport: TransportBillingService,
    private readonly notifyService: NotifyService,
    private readonly publishService: AcademyPublishService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** What the school still has to do before parents can use this (read by the staff screen). */
  async readiness(connected: boolean): Promise<ParentInvoicingReadiness> {
    const issues: ParentInvoicingReadiness["issues"] = [];
    if (!connected) issues.push("NOT_CONNECTED");
    const state = await this.stateRepository.getOrCreate();
    if (!state.publishInvoicesEnabled) issues.push("PUBLISHING_OFF");
    if (!(await this.resolveActor())) issues.push("NO_SYSTEM_USER");
    return { issues };
  }

  async options(academyStudentId: string): Promise<ParentFeeOptionsView> {
    if (academyStudentId.length > MAX_ACADEMY_STUDENT_ID_LENGTH) {
      throw new NotFoundException("AcademyStudent", academyStudentId.slice(0, MAX_ACADEMY_STUDENT_ID_LENGTH));
    }
    const gate = await this.checkGate();
    if (!gate.ok) {
      return { available: false, message: PARENT_INVOICE_REFUSALS[gate.code], terms: [] };
    }
    const student = await this.repository.findLinkedStudent(academyStudentId);
    if (!student || student.status !== "ACTIVE") {
      throw new NotFoundException("AcademyStudent", academyStudentId);
    }

    const terms: TermFeeOptionsView[] = [];
    for (const term of await this.eligibleTerms()) {
      const built = await this.buildTerm(student.studentId, term.id);
      if (built?.plan) {
        terms.push(toTermView(term, built.plan));
      }
    }
    return { available: true, message: null, terms };
  }

  async create(input: CreateParentInvoiceInput): Promise<ParentInvoiceRequestView> {
    if (input.academyStudentId.length > MAX_ACADEMY_STUDENT_ID_LENGTH) {
      // Not a learner of this ERP, and too long to even record: refused without writing anything.
      return {
        requestId: input.requestId,
        status: "REFUSED",
        code: "STUDENT_NOT_LINKED",
        message: PARENT_INVOICE_REFUSALS.STUDENT_NOT_LINKED,
        mode: null,
        invoices: [],
        total: "0.0000",
      };
    }
    const choice: ParentInvoiceChoice = {
      optionalCategoryIds: [...new Set(input.optionalCategoryIds)].sort(),
      routeId: input.routeId ?? null,
    };
    const selection: ParentInvoiceSelection = { optionalCategoryIds: choice.optionalCategoryIds, routeId: choice.routeId };
    const parentName = input.parentName?.trim().slice(0, 200) || null;

    const { inserted, row } = await this.repository.insertReceived({
      academyRequestId: input.requestId,
      academyStudentId: input.academyStudentId,
      termId: input.termId,
      parentName,
      selection,
    });

    if (!inserted) {
      // A repeat of a request we already have. Same request -> report on it; a DIFFERENT request under the same id is a bug
      // or tampering on the caller's side, so it is refused outright rather than silently answered.
      if (
        row.academyStudentId !== input.academyStudentId ||
        row.termId !== input.termId ||
        !sameSelection(row.selection, selection)
      ) {
        throw new ConflictException("This invoice request id was already used for a different request");
      }
      return this.viewOf(row);
    }

    const gate = await this.checkGate();
    if (!gate.ok) {
      return this.refuse(row, gate.code, null);
    }
    const student = await this.repository.findLinkedStudent(input.academyStudentId);
    if (!student || student.status !== "ACTIVE") {
      return this.refuse(row, "STUDENT_NOT_LINKED", null);
    }

    let created: CreatedInvoices;
    try {
      created = await runInTransaction(this.dataSource, (em) => this.createInTransaction(em, row, student, input.termId, choice, gate.actorUserId));
    } catch (error) {
      if (error instanceof ParentInvoiceRefusal) {
        return this.refuse(row, error.code, student.studentId);
      }
      if (error instanceof ConflictException) {
        // BR-BILL-04: the school generated this term's invoice between the parent opening the page and pressing the button.
        return this.refuse(row, "ALREADY_ISSUED", student.studentId);
      }
      // What went wrong is logged for the school's administrator; the parent only ever sees a safe sentence.
      this.logger.error(`Academy invoice request ${input.requestId}: the invoice could not be created: ${(error as Error).message}`);
      return this.refuse(row, "NOT_CREATED", student.studentId);
    }

    const view = await this.viewOf({ ...row, status: "CREATED", studentId: student.studentId, mode: created.mode, feeInvoiceId: created.feeInvoiceId, transportInvoiceId: created.transportInvoiceId });
    await this.afterCreated(student, parentName, created.termName, view, gate.actorUserId);
    return view;
  }

  /** Where the Academy asks "how did my request go?" — and what a repeated request answers. */
  async getStatus(academyRequestId: string): Promise<ParentInvoiceRequestView> {
    const row = await this.repository.findByAcademyRequestId(academyRequestId);
    if (!row) {
      throw new NotFoundException("AcademyParentInvoiceRequest", academyRequestId);
    }
    return this.viewOf(row);
  }

  // ---------------------------------------------------------------------------------------------------------------

  private async createInTransaction(
    em: EntityManager,
    row: ParentInvoiceRequestRow,
    student: LinkedStudent,
    termId: string,
    choice: ParentInvoiceChoice,
    actorUserId: string,
  ): Promise<CreatedInvoices> {
    // One creator at a time per learner and term, so two taps from two tabs cannot both add the same item.
    await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`acadpi:${student.studentId}:${termId}`]);

    // Re-read what is on offer NOW, on a separate connection: this transaction's own snapshot was taken at the lock call,
    // which may predate a commit it just waited for (the same reason `ReceiptVerificationService.ensureToken` does this).
    const term = (await this.eligibleTerms()).find((candidate) => candidate.id === termId);
    if (!term) throw new ParentInvoiceRefusal("TERM_NOT_AVAILABLE");
    const built = await this.buildTerm(student.studentId, term.id);
    if (!built) throw new ParentInvoiceRefusal("TERM_NOT_AVAILABLE");
    if (!built.plan) throw new ParentInvoiceRefusal("NOTHING_TO_ADD");
    const plan = built.plan;
    const refusal = checkChoice(plan, choice);
    if (refusal) throw new ParentInvoiceRefusal(refusal);

    const chosenLines = plan.selectable.filter((line) => choice.optionalCategoryIds.includes(line.categoryId));
    let feeInvoiceId: string | null = null;

    if (plan.mode === "FULL") {
      // The term's whole fee invoice: the engine includes every mandatory line and every optional line with an opt-in row.
      for (const line of chosenLines) {
        await this.optionalItems.create(
          { studentId: student.studentId, termId, feeCategoryId: line.categoryId, amountOverride: null, createdBy: actorUserId, updatedBy: actorUserId },
          em,
        );
      }
      const invoice = await this.invoicing.generateInvoice(em, {
        studentId: student.studentId,
        termId,
        source: "STRUCTURE",
        dueDate: latestDate([...plan.included, ...chosenLines].map((line) => line.dueDate)) ?? undefined,
        createdBy: actorUserId,
      });
      await this.invoicing.postInvoice(em, invoice.id, actorUserId);
      feeInvoiceId = invoice.id;
    } else if (chosenLines.length > 0) {
      const invoice = await this.invoicing.generateInvoice(em, {
        studentId: student.studentId,
        termId,
        source: "ADHOC",
        adhocLines: chosenLines.map((line) => ({ feeCategoryId: line.categoryId, description: line.name, amount: line.amount })),
        dueDate: latestDate(chosenLines.map((line) => line.dueDate)) ?? undefined,
        createdBy: actorUserId,
      });
      await this.invoicing.postInvoice(em, invoice.id, actorUserId);
      feeInvoiceId = invoice.id;
    }

    let transportInvoiceId: string | null = null;
    if (choice.routeId !== null) {
      const [id] = await this.transport.billStudentOnRoute(
        em,
        { studentId: student.studentId, routeId: choice.routeId, termId, dueDate: latestDate(built.allLines.map((line) => line.dueDate)) ?? undefined },
        actorUserId,
      );
      transportInvoiceId = id ?? null;
    }

    await this.repository.markCreated(row.id, { studentId: student.studentId, mode: plan.mode, feeInvoiceId, transportInvoiceId }, em);
    return { mode: plan.mode, feeInvoiceId, transportInvoiceId, termName: term.name };
  }

  /** The current academic year's terms that have not ended, in order. */
  private async eligibleTerms(): Promise<TermRef[]> {
    const year = await this.calendar.getCurrentYear();
    if (!year) return [];
    const today = new Date().toISOString().slice(0, 10);
    return (await this.calendar.listTerms(year.id))
      .filter((term) => term.endsOn >= today)
      .sort((a, b) => a.seq - b.seq)
      .map((term) => ({ id: term.id, name: term.name, isCurrent: term.isCurrent, startsOn: term.startsOn, endsOn: term.endsOn }));
  }

  /** Reads the books for one learner and one term (never inside a caller's transaction) and plans what a parent may do. */
  private async buildTerm(studentId: string, termId: string): Promise<BuiltTerm | null> {
    const structure = await this.feeStructures.findApplicableFor(studentId, termId);
    if (!structure) return null;
    const rawLines = await this.structureLines.listByStructureAndTerm(structure.id, termId);
    if (rawLines.length === 0) return null;

    const names = new Map((await this.categories.list()).map((category) => [category.id, category.name]));
    const lines: TermLine[] = rawLines.map((line) => ({
      categoryId: line.feeCategoryId,
      name: names.get(line.feeCategoryId) ?? "Fee",
      amount: line.amount,
      dueDate: line.dueDate,
      isOptional: line.isOptional,
    }));
    const categoryIds = [...new Set(lines.map((line) => line.categoryId))];

    const [optIns, billed, liveStructureInvoice, transportBilled, routes] = await Promise.all([
      this.optionalItems.listByStudentAndTerm(studentId, termId),
      this.invoiceLines.listAlreadyBilledCategoryIds(studentId, termId, categoryIds),
      this.repository.hasLiveStructureInvoice(studentId, termId),
      this.repository.hasTransportBilled(studentId, termId),
      this.routes.list(),
    ]);

    const plan = planTerm({
      lines,
      schoolOptedCategoryIds: new Set(optIns.map((item) => item.feeCategoryId)),
      billedCategoryIds: billed,
      liveStructureInvoice,
      transportBilled,
      routes: routes.filter((route) => route.isActive).map((route) => ({ routeId: route.id, name: route.name, amount: route.amount })),
    });
    return { plan, allLines: lines };
  }

  private async checkGate(): Promise<Gate> {
    const state = await this.stateRepository.getOrCreate();
    // Parent invoices are only useful when they reach the portal, so publishing must be on as well.
    if (!state.parentInvoicingEnabled || !state.publishInvoicesEnabled) {
      return { ok: false, code: "FEATURE_OFF" };
    }
    const actorUserId = await this.resolveActor();
    return actorUserId ? { ok: true, actorUserId } : { ok: false, code: "NOT_READY" };
  }

  /**
   * The user parent-generated invoices are recorded under: this feature's own setting first, else the existing M-Pesa system
   * cashier. A saved id whose user is missing or not active does not count (the next one is tried); if none works, the first
   * saved one is reported so the school can see WHY it cannot be used.
   */
  async actorStatus(): Promise<ParentInvoiceActorStatus> {
    let unusable: ParentInvoiceActorStatus | null = null;
    for (const [key, source] of [
      [PARENT_INVOICE_ACTOR_SETTING_KEY, "PARENT_INVOICES"],
      [MPESA_SYSTEM_ACTOR_SETTING_KEY, "MPESA"],
    ] as const) {
      const id = await this.settingsService.getTyped<string | null>(key, null);
      if (!id) continue;
      const user = await this.repository.findUserBrief(id);
      const active = user?.status === "ACTIVE";
      const status: ParentInvoiceActorStatus = { configured: active, source, userId: id, userName: user?.fullName ?? null, userActive: active };
      if (active) return status;
      unusable ??= status;
    }
    return unusable ?? { configured: false, source: null, userId: null, userName: null, userActive: false };
  }

  private async resolveActor(): Promise<string | null> {
    const actor = await this.actorStatus();
    return actor.configured ? actor.userId : null;
  }

  private async refuse(row: ParentInvoiceRequestRow, code: ParentInvoiceRefusalCode, studentId: string | null): Promise<ParentInvoiceRequestView> {
    await this.repository.markRefused(row.id, code, PARENT_INVOICE_REFUSALS[code], studentId);
    return {
      requestId: row.academyRequestId,
      status: "REFUSED",
      code,
      message: PARENT_INVOICE_REFUSALS[code],
      mode: null,
      invoices: [],
      total: "0.0000",
    };
  }

  private async viewOf(row: ParentInvoiceRequestRow): Promise<ParentInvoiceRequestView> {
    if (row.status === "REFUSED") {
      return {
        requestId: row.academyRequestId,
        status: "REFUSED",
        code: row.refusalCode,
        message: row.refusalMessage,
        mode: null,
        invoices: [],
        total: "0.0000",
      };
    }
    if (row.status === "RECEIVED") {
      // Accepted but not finished: either still being made, or the process stopped before it was (nothing was created —
      // creation is all-or-nothing). The caller should ask again shortly, or start a new request.
      return { requestId: row.academyRequestId, status: "PENDING", code: null, message: "Your request is still being processed.", mode: null, invoices: [], total: "0.0000" };
    }
    const ids = [row.feeInvoiceId, row.transportInvoiceId].filter((id): id is string => id !== null);
    const briefs = await this.repository.findInvoiceBriefs(ids);
    const kinds = new Map<string, "FEE" | "TRANSPORT">();
    if (row.feeInvoiceId) kinds.set(row.feeInvoiceId, "FEE");
    if (row.transportInvoiceId) kinds.set(row.transportInvoiceId, "TRANSPORT");
    const invoices = briefs.map((brief: InvoiceBrief) => ({
      invoiceId: brief.id,
      number: brief.number,
      kind: kinds.get(brief.id) ?? "FEE",
      total: brief.total,
      dueDate: brief.dueDate,
    }));
    return {
      requestId: row.academyRequestId,
      status: "CREATED",
      code: null,
      message: null,
      mode: row.mode,
      invoices,
      total: sumDecimalStrings(invoices.map((invoice) => invoice.total)),
    };
  }

  /** Tell accounts and get the invoice onto the portal now. Best effort: neither can undo or fail the invoice. */
  private async afterCreated(
    student: LinkedStudent,
    parentName: string | null,
    termName: string,
    view: ParentInvoiceRequestView,
    actorUserId: string,
  ): Promise<void> {
    try {
      const state = await this.stateRepository.getOrCreate();
      const recipients =
        state.parentInvoiceNotifyRoleIds.length > 0
          ? await this.repository.activeUserIdsInRoles(state.parentInvoiceNotifyRoleIds)
          : await this.repository.activeUserIdsWithPermission(PARENT_INVOICE_NOTIFY_FALLBACK_PERMISSION);
      const numbers = view.invoices.map((invoice) => invoice.number).join(", ");
      const first = view.invoices[0];
      const body =
        `${parentName ?? "A parent"} has created ${view.invoices.length > 1 ? "invoices" : "an invoice"} ${numbers} ` +
        `for ${student.fullName} (${student.admissionNo}), ${termName}: KES ${formatKes(view.total)}.`;
      for (const userId of [...new Set(recipients)].filter((id) => id !== actorUserId)) {
        await this.notifyService.notify({
          userId,
          type: PARENT_INVOICE_NOTIFICATION_TYPE,
          title: "Invoice created by a parent",
          body,
          link: first ? `/billing/invoices/${first.invoiceId}` : "/billing/invoices",
          entityType: "INVOICE",
          entityId: first?.invoiceId ?? null,
        });
      }
    } catch (error) {
      this.logger.warn(`Parent invoice for ${student.studentId} was created but accounts could not be notified: ${(error as Error).message}`);
    }
    try {
      await this.publishService.publishPending({ studentId: student.studentId, maxBatches: 1 });
    } catch (error) {
      // The outbox handler and the periodic sweep carry on regardless.
      this.logger.warn(`Parent invoice for ${student.studentId} was created but could not be published at once: ${(error as Error).message}`);
    }
  }
}

interface CreatedInvoices {
  mode: ParentInvoiceMode;
  feeInvoiceId: string | null;
  transportInvoiceId: string | null;
  termName: string;
}

function lineView(line: TermLine): FeeOptionLineView {
  return { categoryId: line.categoryId, name: line.name, amount: line.amount.toDecimalString(), dueDate: line.dueDate };
}

function toTermView(term: TermRef, plan: TermPlan): TermFeeOptionsView {
  return {
    termId: term.id,
    name: term.name,
    isCurrent: term.isCurrent,
    startsOn: term.startsOn,
    endsOn: term.endsOn,
    mode: plan.mode,
    included: plan.included.map(lineView),
    optional: plan.selectable.map(lineView),
    transportRoutes: plan.routes.map((route) => ({ routeId: route.routeId, name: route.name, amount: route.amount.toDecimalString() })),
    transportAlreadyBilled: plan.transportAlreadyBilled,
  };
}

function sameSelection(a: ParentInvoiceSelection, b: ParentInvoiceSelection): boolean {
  return (
    a.routeId === b.routeId &&
    a.optionalCategoryIds.length === b.optionalCategoryIds.length &&
    [...a.optionalCategoryIds].sort().every((id, index) => id === [...b.optionalCategoryIds].sort()[index])
  );
}
