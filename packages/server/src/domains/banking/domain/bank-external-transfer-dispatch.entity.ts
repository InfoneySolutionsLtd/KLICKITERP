import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { BankExternalTransferEntity } from "./bank-external-transfer.entity";

export type BankDispatchProvider = "KCB";

/**
 * PENDING - the request is about to be / is being sent; nothing is known yet
 * SENT    - the bank accepted it and reports success
 * FAILED  - the bank definitely did NOT pay (it refused, or never received the request): a new attempt is allowed
 * UNKNOWN - we sent it but got no usable answer (timeout, 5xx): the bank MAY have paid. Never retried automatically;
 *           a person checks with the bank and resolves it to SENT or FAILED.
 */
export type BankDispatchStatus = "PENDING" | "SENT" | "FAILED" | "UNKNOWN";
export const BANK_DISPATCH_STATUSES: readonly BankDispatchStatus[] = ["PENDING", "SENT", "FAILED", "UNKNOWN"];

/** Statuses in which an attempt still "holds" its transfer — mirrors the partial unique index. */
export const BANK_DISPATCH_ACTIVE_STATUSES: readonly BankDispatchStatus[] = ["PENDING", "SENT", "UNKNOWN"];

/**
 * Maps to `bank_external_transfer_dispatch` — one attempt to actually SEND an approved external transfer through
 * the bank's API. The ERP's external transfer on its own only records the payment in the books (it "never moves a
 * shilling"); this is the row that says the bank was asked to, with what, and what it answered.
 *
 * The row is written and committed BEFORE the bank is called, so a crash can never leave a payment that was sent but
 * left no trace. The database enforces the safety rules (see migration `0262`): the bank reference is unique, and a
 * transfer can have only ONE live (PENDING / SENT / UNKNOWN) attempt — so a double click, a retry, or two people
 * cannot pay the same transfer twice.
 */
@Entity("bank_external_transfer_dispatch")
@Index("uq_bank_ext_transfer_dispatch_ref", ["provider", "reference"], { unique: true })
@Index("uq_bank_ext_transfer_dispatch_active", ["transferId"], { unique: true, where: `"status" IN ('PENDING','SENT','UNKNOWN')` })
@Index("ix_bank_ext_transfer_dispatch_transfer", ["transferId", "createdAt"])
@Check("ck_bank_ext_transfer_dispatch_provider", `"provider" IN ('KCB')`)
@Check("ck_bank_ext_transfer_dispatch_status", `"status" IN ('PENDING','SENT','FAILED','UNKNOWN')`)
@Check("ck_bank_ext_transfer_dispatch_amount_positive", `"amount" > 0`)
export class BankExternalTransferDispatchEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "transfer_id" })
  transferId!: string;

  @ManyToOne(() => BankExternalTransferEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "transfer_id" })
  transfer?: BankExternalTransferEntity;

  @Column({ type: "varchar", length: 20, name: "provider" })
  provider!: BankDispatchProvider;

  /** The 12-character reference given to the bank (KCB: `transactionReference`) — what to quote when asking the bank about it. */
  @Column({ type: "varchar", length: 12, name: "reference" })
  reference!: string;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: BankDispatchStatus;

  @Column({ type: "numeric", precision: 18, scale: 4, name: "amount", transformer: RequiredMoneyTransformer })
  amount!: Money;

  /** Exactly what was sent. */
  @Column({ type: "jsonb", name: "request" })
  request!: Record<string, unknown>;

  /** Exactly what came back, when anything did. */
  @Column({ type: "jsonb", name: "response", nullable: true })
  response!: Record<string, unknown> | null;

  /** The bank's own transaction id (KCB: `retrievalRefNumber`). */
  @Column({ type: "varchar", length: 60, name: "bank_ref", nullable: true })
  bankRef!: string | null;

  /** Why it failed, what is unknown, or how a person resolved it. */
  @Column({ type: "text", name: "note", nullable: true })
  note!: string | null;
}
