import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { BillInvoiceEntity } from "../../billing";

/**
 * Maps to `acad_invoice_publication` — what the ERP has told the Academy parent portal about each invoice, so the
 * publisher knows what still needs sending and never sends the same state twice.
 *
 * `publishedVersion` is the `bill_invoice.version` the Academy last ACCEPTED (the ERP bumps `version` on every change to
 * an invoice — a payment applied, a credit note, a void — so `version > publishedVersion` means "the portal is behind").
 * A row with no `publishedVersion` is an invoice the Academy has so far REJECTED (e.g. its student does not belong to
 * this school there); `lastError` says why and the publisher backs off before trying it again.
 */
@Entity("acad_invoice_publication")
@Index("uq_acad_invoice_publication_invoice", ["invoiceId"], { unique: true })
export class AcadInvoicePublicationEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "invoice_id" })
  invoiceId!: string;

  @ManyToOne(() => BillInvoiceEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_id" })
  invoice?: BillInvoiceEntity;

  @Column({ type: "int", name: "published_version", nullable: true })
  publishedVersion!: number | null;

  @Column({ type: "timestamptz", name: "published_at", nullable: true })
  publishedAt!: Date | null;

  @Column({ type: "int", name: "attempts", default: 0 })
  attempts!: number;

  @Column({ type: "timestamptz", name: "last_attempt_at", nullable: true })
  lastAttemptAt!: Date | null;

  @Column({ type: "varchar", length: 300, name: "last_error", nullable: true })
  lastError!: string | null;
}
