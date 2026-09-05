import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { Money } from "../../../shared/money/money";
import { MoneyTransformer, RequiredMoneyTransformer } from "../../../shared/money/money.transformer";
import { GlAccountEntity, GlJournalEntity } from "../../../accounting";
import { BankAccountEntity } from "./bank-account.entity";

export type BankExternalTransferStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED";
export const BANK_EXTERNAL_TRANSFER_STATUSES: readonly BankExternalTransferStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "POSTED",
];

/**
 * Maps to `bank_external_transfer` (migration `0251`) — P-35, a bank wire
 * OUT to a beneficiary the school does NOT own an account for (a vendor, a
 * refund recipient, any named external party). A deliberately SEPARATE
 * entity from `bank_transfer` (BR-BANK-01's inter-account transfer, always
 * between two of the school's own `bank_account` rows) rather than a
 * retrofit — `bank_transfer.to_account_id` is a NOT NULL FK with a
 * `ck_bank_transfer_accounts_distinct` CHECK, both of which would need
 * invasive relaxation, and the GL shape here is fundamentally different (a
 * real 2-line posting against a user-picked `debit_account_id`, not a
 * 4-line `TRANSFER_CLEARING` posting — see `bank-external-transfers.
 * service.ts`'s own `post()` doc comment for the full P-35 design).
 *
 * `debit_account_id` is the creator-picked "what this payment is for"
 * account (an EXPENSE-class `gl_account`, enforced by the frontend's
 * `<GlAccountSelect accountClass="EXPENSE">` picker only, mirroring
 * `BillConcessionSchemeEntity.glAccountId`'s own precedent exactly — no
 * additional class check server-side). There is no reusable "external
 * payee" `gl_account.control_domain` — the DDL's own 9-value CHECK has no
 * such slot — since an arbitrary external beneficiary has no second, known
 * GL account to net a clearing account against (unlike `TRANSFER_CLEARING`/
 * `MPESA_CLEARING`, which always net against a real, specific counterpart).
 *
 * `reference_no`/`expected_clearing_date`/`fee_amount` — identical shape and
 * semantics to `BankTransferEntity`'s own Part A fields (migration `0250`),
 * see that entity's own doc comment.
 *
 * No "distinct accounts" CHECK exists here — there is no second owned-
 * account leg to compare against, itself confirmation the separate-entity
 * design is right for this feature.
 */
@Entity("bank_external_transfer")
@Index("uq_bank_external_transfer_number", ["number"], { unique: true })
@Check("ck_bank_external_transfer_amount_positive", `"amount" > 0`)
@Check(
  "ck_bank_external_transfer_status",
  `"status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED')`,
)
@Check("ck_bank_external_transfer_fee_amount_nonneg", `"fee_amount" IS NULL OR "fee_amount" >= 0`)
export class BankExternalTransferEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 30, name: "number" })
  number!: string;

  @Column({ type: "uuid", name: "source_account_id" })
  sourceAccountId!: string;

  @ManyToOne(() => BankAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "source_account_id" })
  sourceAccount?: BankAccountEntity;

  @Column({ type: "varchar", length: 120, name: "beneficiary_name" })
  beneficiaryName!: string;

  @Column({ type: "varchar", length: 120, name: "beneficiary_bank_name" })
  beneficiaryBankName!: string;

  @Column({ type: "varchar", length: 120, name: "beneficiary_branch", nullable: true })
  beneficiaryBranch!: string | null;

  @Column({ type: "varchar", length: 40, name: "beneficiary_account_no" })
  beneficiaryAccountNo!: string;

  @Column({ type: "uuid", name: "debit_account_id" })
  debitAccountId!: string;

  @ManyToOne(() => GlAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "debit_account_id" })
  debitAccount?: GlAccountEntity;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "amount",
    transformer: RequiredMoneyTransformer,
  })
  amount!: Money;

  @Column({ type: "varchar", length: 18, name: "status" })
  status!: BankExternalTransferStatus;

  /** Loose uuid, no FK — same treatment as `BankTransferEntity.approvalRef`. */
  @Column({ type: "uuid", name: "approval_ref", nullable: true })
  approvalRef!: string | null;

  @Column({ type: "uuid", name: "journal_id", nullable: true })
  journalId!: string | null;

  @ManyToOne(() => GlJournalEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "journal_id" })
  journal?: GlJournalEntity | null;

  @Column({ type: "varchar", length: 60, name: "reference_no", nullable: true })
  referenceNo!: string | null;

  @Column({ type: "date", name: "expected_clearing_date", nullable: true })
  expectedClearingDate!: string | null;

  @Column({
    type: "numeric",
    precision: 18,
    scale: 4,
    name: "fee_amount",
    nullable: true,
    transformer: MoneyTransformer,
  })
  feeAmount!: Money | null;
}
