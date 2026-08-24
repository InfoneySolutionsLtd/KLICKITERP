import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
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

/**
 * Phase 6 (Transport Routes enhancement) — bills a `bill_transport_route`'s
 * own flat `amount` to a caller-selected list of students for one term, via
 * the ADHOC invoice path. Mirrors `BulkAdhocInvoicesService.bulkGenerate()`'s
 * exact shape: one `runInTransaction` PER STUDENT, a failure on one student
 * never aborts the batch, `{succeeded, failed}` result (no `skipped[]` here —
 * unlike ad-hoc category billing, there is no duplicate-fee-category guard
 * for transport fees in this pass; re-billing the same student for the same
 * route/term is allowed, matching how `LateFeeBatchesService`/`DebitNotesService`
 * both call `InvoicingService.generateInvoice()` directly with no such guard).
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
}
