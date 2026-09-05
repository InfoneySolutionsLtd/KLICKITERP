import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NumberingService } from "../../../platform/settings";
import { BankExternalTransferEntity } from "../domain/bank-external-transfer.entity";
import { BankAccountRepository } from "../infrastructure/bank-account.repository";
import {
  BankExternalTransferRepository,
  ListBankExternalTransfersFilter,
} from "../infrastructure/bank-external-transfer.repository";
import { resolveBankChargesExpenseAccount } from "./gl-banking-accounts.util";

/** `appr_workflow_def.domain_code` this module submits `bank_external_transfer`s under — seeded by migration `0252` the same single-level System-Admin-approver way `BANK_TRANSFERS` (`0900`) and every other amount-tiered chain in this codebase already is. */
export const EXTERNAL_BANK_TRANSFERS_APPROVAL_DOMAIN_CODE = "EXTERNAL_BANK_TRANSFERS";

export interface CreateBankExternalTransferInput {
  sourceAccountId: string;
  beneficiaryName: string;
  beneficiaryBankName: string;
  beneficiaryBranch?: string | null;
  beneficiaryAccountNo: string;
  debitAccountId: string;
  amount: Money;
  feeAmount?: Money;
  referenceNo?: string | null;
  expectedClearingDate?: string | null;
}

/**
 * P-35 — a bank wire OUT to a beneficiary the school does NOT own an
 * account for. Posted as ONE balanced `PostingService.post()` call, 2 real
 * lines (no clearing account, unlike P-32 — see class doc comment on
 * `BankExternalTransferEntity` for why):
 *   1. debit the creator-picked `debit_account_id` (what this payment is for)
 *   2. credit the source account's own `gl_account_id`
 * plus 2 more when `feeAmount` is set and non-zero (debit Bank Charges
 * Expense / credit the source account again) — same fee-leg shape as
 * `BankTransfersService.post()`'s own P-32 fee extension.
 */
@Injectable()
export class BankExternalTransfersService {
  constructor(
    private readonly transferRepository: BankExternalTransferRepository,
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  async create(
    em: EntityManager,
    input: CreateBankExternalTransferInput,
    actorId: string | null,
  ): Promise<BankExternalTransferEntity> {
    if (!input.amount.isPositive()) {
      throw new ValidationException("ck_bank_external_transfer_amount_positive: amount must be > 0");
    }
    if (input.feeAmount && input.feeAmount.isNegative()) {
      throw new ValidationException("ck_bank_external_transfer_fee_amount_nonneg: feeAmount must be >= 0");
    }
    await this.bankAccountRepository.findByIdOrFail(input.sourceAccountId, em);
    // Existence check only — no accountClass restriction server-side, the
    // same precedent `ConcessionSchemesService.create()` already establishes
    // for its own creator-picked `glAccountId` (enforced by the frontend's
    // `<GlAccountSelect accountClass="EXPENSE">` picker only).
    await this.glAccountRepository.findByIdOrFail(input.debitAccountId, em);

    const transferId = generateUuidV7();
    return this.transferRepository.create(
      {
        id: transferId,
        number: `DRAFT-${transferId.replace(/-/g, "").slice(0, 24)}`,
        sourceAccountId: input.sourceAccountId,
        beneficiaryName: input.beneficiaryName,
        beneficiaryBankName: input.beneficiaryBankName,
        beneficiaryBranch: input.beneficiaryBranch ?? null,
        beneficiaryAccountNo: input.beneficiaryAccountNo,
        debitAccountId: input.debitAccountId,
        amount: input.amount,
        status: "DRAFT",
        approvalRef: null,
        journalId: null,
        feeAmount: input.feeAmount ?? null,
        referenceNo: input.referenceNo ?? null,
        expectedClearingDate: input.expectedClearingDate ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );
  }

  async findByIdOrFail(id: string): Promise<BankExternalTransferEntity> {
    return this.transferRepository.findByIdOrFail(id);
  }

  async list(filter: ListBankExternalTransfersFilter = {}): Promise<BankExternalTransferEntity[]> {
    return this.transferRepository.list(filter);
  }

  /** Pure metadata — no status guard, same reasoning as `BankTransfersService.updateReferenceNo()`. */
  async updateReferenceNo(
    em: EntityManager,
    transferId: string,
    referenceNo: string,
    actorId: string | null,
  ): Promise<BankExternalTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    transfer.referenceNo = referenceNo;
    transfer.updatedBy = actorId;
    return this.transferRepository.save(transfer, em);
  }

  async submitForApproval(em: EntityManager, transferId: string, initiatorId: string): Promise<BankExternalTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    if (transfer.status !== "DRAFT") {
      throw new ValidationException(
        `Only a DRAFT external bank transfer can be submitted (transfer ${transferId} status=${transfer.status})`,
      );
    }

    const instance = await this.approvalEngine.submit(em, {
      domainCode: EXTERNAL_BANK_TRANSFERS_APPROVAL_DOMAIN_CODE,
      entityType: "bank_external_transfer",
      entityId: transfer.id,
      amount: transfer.amount,
      initiatorId,
    });

    transfer.status = "PENDING_APPROVAL";
    transfer.approvalRef = instance.id;
    transfer.updatedBy = initiatorId;
    return this.transferRepository.save(transfer, em);
  }

  /** Same interim manual-trigger pattern as `BankTransfersService.onApprovalDecided()` — a rejection reverts to DRAFT, no dedicated REJECTED status exists. */
  async onApprovalDecided(
    em: EntityManager,
    transferId: string,
    approved: boolean,
    actorId: string | null = null,
  ): Promise<BankExternalTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    if (transfer.status !== "PENDING_APPROVAL") {
      throw new ValidationException(
        `bank_external_transfer ${transferId} is not PENDING_APPROVAL (status=${transfer.status})`,
      );
    }
    transfer.status = approved ? "APPROVED" : "DRAFT";
    if (!approved) transfer.approvalRef = null;
    transfer.updatedBy = actorId;
    return this.transferRepository.save(transfer, em);
  }

  /** P-35 — requires `APPROVED`. See class doc comment for the exact 2-or-4-line mechanism. */
  async post(em: EntityManager, transferId: string, postedBy: string): Promise<BankExternalTransferEntity> {
    const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
    if (transfer.status !== "APPROVED") {
      throw new ValidationException(
        `Only an APPROVED external bank transfer can be posted (transfer ${transferId} status=${transfer.status})`,
      );
    }

    const sourceAccount = await this.bankAccountRepository.findByIdOrFail(transfer.sourceAccountId, em);
    const debitAccount = await this.glAccountRepository.findByIdOrFail(transfer.debitAccountId, em);

    const lines = [
      {
        accountId: debitAccount.id,
        debit: transfer.amount,
        credit: Money.ZERO,
        memo: `P-35 external transfer to ${transfer.beneficiaryName}`,
        entityRefType: "bank_external_transfer",
        entityRefId: transfer.id,
      },
      {
        accountId: sourceAccount.glAccountId,
        debit: Money.ZERO,
        credit: transfer.amount,
        memo: `P-35 source account (${sourceAccount.name})`,
        entityRefType: "bank_external_transfer",
        entityRefId: transfer.id,
      },
    ];

    if (transfer.feeAmount && !transfer.feeAmount.isZero()) {
      const bankChargesAccount = await resolveBankChargesExpenseAccount(this.glAccountRepository, em);
      lines.push(
        {
          accountId: bankChargesAccount.id,
          debit: transfer.feeAmount,
          credit: Money.ZERO,
          memo: "P-35 transfer fee (Bank Charges Expense)",
          entityRefType: "bank_external_transfer",
          entityRefId: transfer.id,
        },
        {
          accountId: sourceAccount.glAccountId,
          debit: Money.ZERO,
          credit: transfer.feeAmount,
          memo: `P-35 transfer fee — charged to source account (${sourceAccount.name})`,
          entityRefType: "bank_external_transfer",
          entityRefId: transfer.id,
        },
      );
    }

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "banking",
      sourceDocType: "bank_external_transfer",
      sourceDocId: transfer.id,
      narration: `P-35 external bank transfer: ${sourceAccount.name} -> ${transfer.beneficiaryName}`,
      journalType: "MANUAL",
      postedBy,
      approvalRef: transfer.approvalRef,
      lines,
    });

    const number = await this.numberingService.allocate(em, "BANK_EXTERNAL_TRANSFER");
    transfer.number = number;
    transfer.status = "POSTED";
    transfer.journalId = journal.id;
    transfer.updatedBy = postedBy;
    return this.transferRepository.save(transfer, em);
  }
}
