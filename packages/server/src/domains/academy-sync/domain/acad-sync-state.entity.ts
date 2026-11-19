import { Column, Entity, Index } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";

/**
 * Maps to `acad_sync_state` — a singleton row (`uq_acad_sync_state_singleton` + `ck_acad_sync_state_singleton`) holding
 * where the Academy student sync stands. Kept separate from the run log so "what happens next" is one cheap read.
 *
 * - `firstImportConfirmedAt`: nothing is created in the ERP until an admin has looked at the preview and confirmed.
 *   Scheduled runs refuse to start before this is set.
 * - `autoSyncEnabled`: the worker's scheduled runs are opt-in, even after the first import.
 * - `lastUpdatedSince`: the Academy's own `updatedAt` text (opaque, timezone-free) of the newest student a successful
 *   run processed. The next incremental run asks for students changed at or after it; boundary rows are simply seen
 *   twice, which is harmless because every step is idempotent.
 */
@Entity("acad_sync_state")
@Index("uq_acad_sync_state_singleton", ["singleton"], { unique: true })
export class AcadSyncStateEntity extends MutableBaseEntity {
  @Column({ type: "boolean", name: "singleton", default: true })
  singleton!: boolean;

  @Column({ type: "timestamptz", name: "first_import_confirmed_at", nullable: true })
  firstImportConfirmedAt!: Date | null;

  @Column({ type: "uuid", name: "first_import_confirmed_by", nullable: true })
  firstImportConfirmedBy!: string | null;

  @Column({ type: "boolean", name: "auto_sync_enabled", default: false })
  autoSyncEnabled!: boolean;

  @Column({ type: "timestamptz", name: "last_success_at", nullable: true })
  lastSuccessAt!: Date | null;

  @Column({ type: "timestamptz", name: "last_full_success_at", nullable: true })
  lastFullSuccessAt!: Date | null;

  @Column({ type: "varchar", length: 40, name: "last_updated_since", nullable: true })
  lastUpdatedSince!: string | null;

  /** Publishing the ERP's invoices to the Academy parent portal. OFF until an admin switches it on. */
  @Column({ type: "boolean", name: "publish_invoices_enabled", default: false })
  publishInvoicesEnabled!: boolean;

  @Column({ type: "timestamptz", name: "last_publish_at", nullable: true })
  lastPublishAt!: Date | null;

  @Column({ type: "boolean", name: "last_publish_ok", nullable: true })
  lastPublishOk!: boolean | null;

  @Column({ type: "varchar", length: 300, name: "last_publish_message", nullable: true })
  lastPublishMessage!: string | null;

  /**
   * Parents may customise (optional fee items, transport) and generate their own fee invoices from the parent portal.
   * OFF until an admin switches it on; needs `publishInvoicesEnabled` too, or the parent would never see what they made.
   */
  @Column({ type: "boolean", name: "parent_invoicing_enabled", default: false })
  parentInvoicingEnabled!: boolean;

  /** Roles whose active users are notified when a parent generates an invoice. Empty = everyone who can post invoices. */
  @Column({ type: "uuid", name: "parent_invoice_notify_role_ids", array: true, default: () => "'{}'" })
  parentInvoiceNotifyRoleIds!: string[];
}
