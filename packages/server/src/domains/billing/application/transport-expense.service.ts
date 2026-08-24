import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
// Real service dependencies, imported via `domains/expenses`' own barrel —
// never its application/infrastructure internals — matching every other
// cross-domain *service* reuse in this codebase (`resolveControlAccount()`
// consumers in `domains/wallet`/`domains/inventory`/`domains/payroll`/
// `domains/banking` all follow this exact same barrel-only convention).
import { ExpCategoryRepository, VouchersService } from "../../expenses";
import type { ExpVoucherEntity, ExpVoucherPayeeType, ExpVoucherMethod } from "../../expenses";
import { BillTransportExpenseEntity } from "../domain/bill-transport-expense.entity";
import { BillTransportRouteRepository } from "../infrastructure/bill-transport-route.repository";
import { BillTransportExpenseRepository } from "../infrastructure/bill-transport-expense.repository";
import { BillTransportBillingLineRepository } from "../infrastructure/bill-transport-billing-line.repository";

/**
 * Migration `0245`'s idempotent seed (mirroring `TRANSPORT_FEE_INCOME_CATEGORY_NAME`'s
 * own pattern, on the expense side) upserts an `exp_category` row with this
 * name, pointed at a NEW dedicated `5140 Transport/Vehicle Expense` GL leaf
 * (unlike the income side, no existing `5xxx` leaf fit — confirmed by
 * direct search of `COA_TEMPLATE`, the same documented gap
 * `LateFeeBatchesService`'s own doc comment flagged for its own category
 * before reusing `4030`).
 */
export const TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME = "Transport/Vehicle Expense";

export interface LogTransportExpenseInput {
  routeId: string;
  payeeType: ExpVoucherPayeeType;
  payeeRef: Record<string, unknown>;
  amount: Money;
  method: ExpVoucherMethod;
  narrative: string;
}

/**
 * Phase 6 (Transport Routes enhancement) — a bus expense (fuel, repairs,
 * etc.) IS an ordinary `exp_voucher`; this service does not duplicate
 * `VouchersService`'s create/submit/decide/pay lifecycle, GL posting, or
 * approval/attachment/budget checks — it only (a) pins the category to the
 * designated `TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME` row so the caller
 * never has to look it up, and (b) records a `bill_transport_expense` link
 * row tying the resulting voucher to a `bill_transport_route`, in the same
 * transaction as the voucher's own creation. Full lifecycle management
 * (submit/approve/pay) happens on the existing Expenses screens against the
 * real `exp_voucher` id this returns — this service is not involved again
 * after `logExpense()` creates it.
 */
@Injectable()
export class TransportExpenseService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transportRouteRepository: BillTransportRouteRepository,
    private readonly expCategoryRepository: ExpCategoryRepository,
    private readonly vouchersService: VouchersService,
    private readonly transportExpenseRepository: BillTransportExpenseRepository,
    private readonly transportBillingLineRepository: BillTransportBillingLineRepository,
  ) {}

  async logExpense(
    input: LogTransportExpenseInput,
    actorId: string | null,
  ): Promise<{ expense: BillTransportExpenseEntity; voucher: ExpVoucherEntity }> {
    await this.transportRouteRepository.findByIdOrFail(input.routeId);
    const category = await this.expCategoryRepository.findByName(TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME);
    if (!category) {
      throw new NotFoundException(
        "ExpCategory",
        `${TRANSPORT_VEHICLE_EXPENSE_CATEGORY_NAME} — expected migration 0245 to have upserted it`,
      );
    }

    return runInTransaction(this.dataSource, async (manager) => {
      const voucher = await this.vouchersService.create(
        {
          payeeType: input.payeeType,
          payeeRef: input.payeeRef,
          categoryId: category.id,
          amount: input.amount,
          method: input.method,
          narrative: input.narrative,
        },
        actorId,
        manager,
      );
      const expense = await this.transportExpenseRepository.create(
        { routeId: input.routeId, voucherId: voucher.id },
        manager,
      );
      return { expense, voucher };
    });
  }

  async listByRoute(routeId: string): Promise<BillTransportExpenseEntity[]> {
    return this.transportExpenseRepository.listByRoute(routeId);
  }

  /** Income (billed transport fee lines) vs. expense (logged vouchers) totals for one route, as decimal strings. */
  async getSummary(routeId: string): Promise<{ totalIncome: string; totalExpense: string }> {
    await this.transportRouteRepository.findByIdOrFail(routeId);
    const [totalIncome, totalExpense] = await Promise.all([
      this.transportBillingLineRepository.sumAmountByRoute(routeId),
      this.transportExpenseRepository.sumAmountByRoute(routeId),
    ]);
    return { totalIncome, totalExpense };
  }
}
