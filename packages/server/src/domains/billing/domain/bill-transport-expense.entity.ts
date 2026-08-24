import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { BillTransportRouteEntity } from "./bill-transport-route.entity";
// Direct entity-file import, never `domains/expenses`' barrel — mirrors
// `fa_maintenance.cost_expense_voucher_id`'s own exact precedent in
// `domains/fixed-assets` (the only other place in this codebase a domain
// references an `exp_voucher`), same circular-require-avoidance discipline.
// `domains/billing`'s own `mayImport` list gained `domains/expenses` for
// exactly this (module-deps.json, 2026-08-22).
import { ExpVoucherEntity } from "../../expenses/domain/exp-voucher.entity";

/**
 * Maps to `bill_transport_expense` (migration `0245`) — links a real
 * `exp_voucher` (fuel, repairs, etc.) to the `bill_transport_route` it was
 * incurred for, enabling a per-route income (via `bill_transport_billing_line`)
 * vs. expense summary. Plain `BaseEntity` (immutable, insert-once).
 *
 * Deliberately NOT a new expense-entry mechanism — a bus expense IS an
 * ordinary `exp_voucher`, created via `VouchersService.create()` unchanged
 * (same DRAFT->PENDING_APPROVAL->APPROVED->PAID lifecycle, real GL posting,
 * real attachment/budget checks as every other expense in this system).
 * `TransportExpenseService.logExpense()` is the only writer of this table —
 * it calls `VouchersService.create()` then inserts this one link row in the
 * same transaction.
 */
@Entity("bill_transport_expense")
export class BillTransportExpenseEntity extends BaseEntity {
  @Column({ type: "uuid", name: "route_id" })
  routeId!: string;

  @ManyToOne(() => BillTransportRouteEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "route_id" })
  route?: BillTransportRouteEntity;

  @Column({ type: "uuid", name: "voucher_id" })
  voucherId!: string;

  @ManyToOne(() => ExpVoucherEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "voucher_id" })
  voucher?: ExpVoucherEntity;
}
