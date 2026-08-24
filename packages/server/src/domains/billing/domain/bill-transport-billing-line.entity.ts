import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../shared/database/base.entity";
import { BillTransportRouteEntity } from "./bill-transport-route.entity";
import { BillInvoiceLineEntity } from "./bill-invoice-line.entity";
// Direct entity-file import, not `domains/students`' barrel — same
// circular-require-avoidance discipline every other cross-domain FK in this
// module already follows (see `bill-refund-voucher.entity.ts`'s own import
// comment for the fuller precedent explanation).
import { StdStudentEntity } from "../../students/domain/std-student.entity";

/**
 * Maps to `bill_transport_billing_line` (migration `0245`) — records exactly
 * which real `bill_invoice_line` rows a "Bill Transport" run created for a
 * given route, so the route's own income can later be summed precisely
 * (`TransportRoutesController`'s `.../summary` route). Plain `BaseEntity`
 * (immutable, insert-once — no update lifecycle exists for this record).
 *
 * Deliberately a thin link table rather than a new column on
 * `bill_invoice_line` itself: that table is the shared core every billing
 * flow in this codebase writes through (`InvoicingService.generateInvoice()`/
 * `.postInvoice()`), so this pass keeps the transport-billing feature fully
 * additive/isolated instead of touching it. Populated by
 * `TransportBillingService.billStudents()` immediately after each
 * `generateInvoice()`+`postInvoice()` call, one row per resulting invoice
 * line (in practice always exactly one per student per run, since a single
 * flat-fee `adhocLines` entry is billed).
 */
@Entity("bill_transport_billing_line")
export class BillTransportBillingLineEntity extends BaseEntity {
  @Column({ type: "uuid", name: "route_id" })
  routeId!: string;

  @ManyToOne(() => BillTransportRouteEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "route_id" })
  route?: BillTransportRouteEntity;

  @Column({ type: "uuid", name: "invoice_line_id" })
  invoiceLineId!: string;

  @ManyToOne(() => BillInvoiceLineEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_line_id" })
  invoiceLine?: BillInvoiceLineEntity;

  @Column({ type: "uuid", name: "student_id" })
  studentId!: string;

  @ManyToOne(() => StdStudentEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "student_id" })
  student?: StdStudentEntity;
}
