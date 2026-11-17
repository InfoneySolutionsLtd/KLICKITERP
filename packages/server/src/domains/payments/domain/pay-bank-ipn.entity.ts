import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { PayReceiptEntity } from "./pay-receipt.entity";
import { PaySuspenseItemEntity } from "./pay-suspense-item.entity";

export type PayBankIpnProvider = "KCB";
export const PAY_BANK_IPN_PROVIDERS: readonly PayBankIpnProvider[] = ["KCB"];

/** ACCOUNT = a deposit/transfer into the school's bank account; TILL = a Paybill/till (M-Pesa) payment KCB settled to it. */
export type PayBankIpnKind = "ACCOUNT" | "TILL";
export const PAY_BANK_IPN_KINDS: readonly PayBankIpnKind[] = ["ACCOUNT", "TILL"];

/**
 * RECEIVED  - stored, not yet turned into money in the ledger (transient; a retry or sweep finishes it)
 * MATCHED   - matched to a student and a receipt was captured
 * SUSPENDED - could not be matched/captured automatically; parked in `pay_suspense_item` for a person to resolve
 */
export type PayBankIpnState = "RECEIVED" | "MATCHED" | "SUSPENDED";
export const PAY_BANK_IPN_STATES: readonly PayBankIpnState[] = ["RECEIVED", "MATCHED", "SUSPENDED"];

/**
 * Maps to `pay_bank_ipn` — the permanent log of every payment notification a bank pushed to us (today: KCB BUNI's
 * Instant Payment Notification). Written BEFORE anything is posted, so a notification is never lost and never
 * processed twice:
 *
 * - `uq_pay_bank_ipn_ref` (provider, kind, external_ref) is the idempotency guard — banks retry, and a retry of an
 *   already-seen notification must have no second effect (BR-PAY-06's spirit, applied to bank notifications);
 * - `raw` keeps the payload verbatim (audit, and the source of truth if a mapping rule is ever fixed and a
 *   notification has to be re-read);
 * - `state` + `receipt_id` / `suspense_item_id` say what became of it, so "did this payment arrive?" is answerable
 *   from one table.
 *
 * Only notifications whose signature checked out are stored; a request with a bad signature is logged and dropped
 * (storing forged requests would let anyone fill the table).
 */
@Entity("pay_bank_ipn")
@Index("uq_pay_bank_ipn_ref", ["provider", "kind", "externalRef"], { unique: true })
@Index("ix_pay_bank_ipn_created", ["createdAt"])
@Index("ix_pay_bank_ipn_state_p", ["createdAt"], { where: `"state" <> 'MATCHED'` })
@Check("ck_pay_bank_ipn_provider", `"provider" IN ('KCB')`)
@Check("ck_pay_bank_ipn_kind", `"kind" IN ('ACCOUNT','TILL')`)
@Check("ck_pay_bank_ipn_state", `"state" IN ('RECEIVED','MATCHED','SUSPENDED')`)
@Check("ck_pay_bank_ipn_amount_positive", `"amount" > 0`)
export class PayBankIpnEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 20, name: "provider" })
  provider!: PayBankIpnProvider;

  @Column({ type: "varchar", length: 10, name: "kind" })
  kind!: PayBankIpnKind;

  /** The bank's own transaction identifier — `transactionReference` (ACCOUNT) / `transactionID` (TILL). */
  @Column({ type: "varchar", length: 60, name: "external_ref" })
  externalRef!: string;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "amount", transformer: RequiredMoneyTransformer })
  amount!: Money;

  @Column({ type: "varchar", length: 3, name: "currency" })
  currency!: string;

  /** What the payer typed as the account/bill reference — normally the student's admission number. */
  @Column({ type: "varchar", length: 100, name: "customer_reference", nullable: true })
  customerReference!: string | null;

  @Column({ type: "varchar", length: 150, name: "payer_name", nullable: true })
  payerName!: string | null;

  /** All but the last 3 digits masked — the full number stays only inside `raw`. */
  @Column({ type: "varchar", length: 20, name: "payer_msisdn_masked", nullable: true })
  payerMsisdnMasked!: string | null;

  @Column({ type: "varchar", length: 255, name: "narration", nullable: true })
  narration!: string | null;

  /** The school bank account the money was credited to, as the bank names it. */
  @Column({ type: "varchar", length: 40, name: "credit_account", nullable: true })
  creditAccount!: string | null;

  @Column({ type: "varchar", length: 40, name: "till_number", nullable: true })
  tillNumber!: string | null;

  @Column({ type: "timestamptz", name: "transaction_at" })
  transactionAt!: Date;

  @Column({ type: "varchar", length: 10, name: "state" })
  state!: PayBankIpnState;

  @Column({ type: "uuid", name: "receipt_id", nullable: true })
  receiptId!: string | null;

  @ManyToOne(() => PayReceiptEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "receipt_id" })
  receipt?: PayReceiptEntity | null;

  @Column({ type: "uuid", name: "suspense_item_id", nullable: true })
  suspenseItemId!: string | null;

  @ManyToOne(() => PaySuspenseItemEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "suspense_item_id" })
  suspenseItem?: PaySuspenseItemEntity | null;

  /** Why it was parked in suspense (no such student, currency not KES, account not configured, ...). */
  @Column({ type: "text", name: "note", nullable: true })
  note!: string | null;

  @Column({ type: "jsonb", name: "raw" })
  raw!: Record<string, unknown>;
}
