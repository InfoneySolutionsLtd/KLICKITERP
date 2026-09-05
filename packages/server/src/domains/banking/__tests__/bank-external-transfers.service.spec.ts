import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import {
  BankExternalTransfersService,
  EXTERNAL_BANK_TRANSFERS_APPROVAL_DOMAIN_CODE,
} from "../application/bank-external-transfers.service";
import { BankAccountEntity } from "../domain/bank-account.entity";
import { BankExternalTransferEntity } from "../domain/bank-external-transfer.entity";

function makeSourceAccount(overrides: Partial<BankAccountEntity> = {}): BankAccountEntity {
  return {
    id: "source-acc",
    name: "Source Bank",
    kind: "BANK",
    glAccountId: "gl-source",
    isActive: true,
    ...overrides,
  } as BankAccountEntity;
}

function makeTransfer(overrides: Partial<BankExternalTransferEntity> = {}): BankExternalTransferEntity {
  return {
    id: "ext-transfer-1",
    number: "DRAFT-ext-transfer-1",
    sourceAccountId: "source-acc",
    beneficiaryName: "Acme Supplies Ltd",
    beneficiaryBankName: "Equity Bank",
    beneficiaryBranch: "Westlands",
    beneficiaryAccountNo: "0123456789",
    debitAccountId: "debit-acc",
    amount: Money.fromInt(1000),
    status: "DRAFT",
    approvalRef: null,
    journalId: null,
    feeAmount: null,
    referenceNo: null,
    expectedClearingDate: null,
    ...overrides,
  } as BankExternalTransferEntity;
}

function makeGlAccount(overrides: Partial<GlAccountEntity> = {}): GlAccountEntity {
  return { id: "debit-acc", code: "5050", isActive: true, isPostable: true, controlDomain: null, ...overrides } as GlAccountEntity;
}

describe("BankExternalTransfersService", () => {
  let transferRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; list: jest.Mock };
  let bankAccountRepository: { findByIdOrFail: jest.Mock };
  let glAccountRepository: { findByIdOrFail: jest.Mock; findByCodeOrFail: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let service: BankExternalTransfersService;

  const em = {} as EntityManager;

  beforeEach(() => {
    transferRepository = {
      findByIdOrFail: jest.fn(async () => makeTransfer()),
      create: jest.fn(async (data) => makeTransfer(data)),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    bankAccountRepository = {
      findByIdOrFail: jest.fn(async (id: string) => makeSourceAccount({ id })),
    };
    glAccountRepository = {
      findByIdOrFail: jest.fn(async (id: string) => makeGlAccount({ id })),
      findByCodeOrFail: jest.fn(async () => makeGlAccount({ id: "bank-charges-acc", code: "5100", controlDomain: null })),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "EXT-000001") };
    approvalEngine = { submit: jest.fn(async () => ({ id: "approval-1" })) };

    service = new BankExternalTransfersService(
      transferRepository as never,
      bankAccountRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      approvalEngine as never,
    );
  });

  describe("create()", () => {
    const validInput = {
      sourceAccountId: "source-acc",
      beneficiaryName: "Acme Supplies Ltd",
      beneficiaryBankName: "Equity Bank",
      beneficiaryAccountNo: "0123456789",
      debitAccountId: "debit-acc",
      amount: Money.fromInt(1000),
    };

    it("rejects a non-positive amount", async () => {
      await expect(service.create(em, { ...validInput, amount: Money.ZERO }, "actor-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a negative feeAmount", async () => {
      await expect(service.create(em, { ...validInput, feeAmount: Money.fromInt(-5) }, "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("validates both sourceAccountId and debitAccountId exist", async () => {
      await service.create(em, validInput, "actor-1");
      expect(bankAccountRepository.findByIdOrFail).toHaveBeenCalledWith("source-acc", em);
      expect(glAccountRepository.findByIdOrFail).toHaveBeenCalledWith("debit-acc", em);
    });

    it("creates a DRAFT external transfer with a placeholder number and the full beneficiary detail", async () => {
      const result = await service.create(em, validInput, "actor-1");
      expect(result.status).toBe("DRAFT");
      expect(result.number).toMatch(/^DRAFT-/);
      expect(result.beneficiaryName).toBe("Acme Supplies Ltd");
      expect(result.beneficiaryBankName).toBe("Equity Bank");
      expect(result.beneficiaryAccountNo).toBe("0123456789");
      expect(result.feeAmount).toBeNull();
      expect(result.referenceNo).toBeNull();
      expect(result.expectedClearingDate).toBeNull();
    });

    it("persists feeAmount/referenceNo/expectedClearingDate/beneficiaryBranch when given", async () => {
      const result = await service.create(
        em,
        { ...validInput, beneficiaryBranch: "Westlands", feeAmount: Money.fromInt(50), referenceNo: "WIRE-001", expectedClearingDate: "2026-09-10" },
        "actor-1",
      );
      expect(result.beneficiaryBranch).toBe("Westlands");
      expect(result.feeAmount).toEqual(Money.fromInt(50));
      expect(result.referenceNo).toBe("WIRE-001");
      expect(result.expectedClearingDate).toBe("2026-09-10");
    });
  });

  describe("updateReferenceNo()", () => {
    it("sets referenceNo regardless of status — pure metadata, no status guard", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "POSTED", referenceNo: null }));
      const result = await service.updateReferenceNo(em, "ext-transfer-1", "WIRE-REF-999", "actor-1");
      expect(result.referenceNo).toBe("WIRE-REF-999");
    });
  });

  describe("submitForApproval()", () => {
    it("submits under EXTERNAL_BANK_TRANSFERS domain code", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "DRAFT" }));
      const result = await service.submitForApproval(em, "ext-transfer-1", "initiator-1");
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          domainCode: EXTERNAL_BANK_TRANSFERS_APPROVAL_DOMAIN_CODE,
          entityType: "bank_external_transfer",
          entityId: "ext-transfer-1",
        }),
      );
      expect(result.status).toBe("PENDING_APPROVAL");
    });

    it("rejects a non-DRAFT transfer", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "APPROVED" }));
      await expect(service.submitForApproval(em, "ext-transfer-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("onApprovalDecided()", () => {
    it("approved -> APPROVED", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "PENDING_APPROVAL" }));
      const result = await service.onApprovalDecided(em, "ext-transfer-1", true, "actor-1");
      expect(result.status).toBe("APPROVED");
    });

    it("rejected -> reverts to DRAFT", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "PENDING_APPROVAL", approvalRef: "approval-1" }));
      const result = await service.onApprovalDecided(em, "ext-transfer-1", false, "actor-1");
      expect(result.status).toBe("DRAFT");
      expect(result.approvalRef).toBeNull();
    });
  });

  describe("post() — P-35 exact 2-or-4-line assertions", () => {
    beforeEach(() => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "APPROVED", amount: Money.fromInt(1000) }));
    });

    it("rejects a non-APPROVED transfer", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(makeTransfer({ status: "DRAFT" }));
      await expect(service.post(em, "ext-transfer-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("posts exactly 2 lines when there is no fee: debit the picked GL account, credit the source account", async () => {
      await service.post(em, "ext-transfer-1", "poster-1");
      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toHaveLength(2);

      const [debitLine, creditLine] = draft.lines;
      expect(debitLine).toEqual(expect.objectContaining({ accountId: "debit-acc", debit: Money.fromInt(1000), credit: Money.ZERO }));
      expect(creditLine).toEqual(expect.objectContaining({ accountId: "gl-source", debit: Money.ZERO, credit: Money.fromInt(1000) }));

      const totalDebit = draft.lines.reduce((sum: Money, l: { debit: Money }) => sum.add(l.debit), Money.ZERO);
      const totalCredit = draft.lines.reduce((sum: Money, l: { credit: Money }) => sum.add(l.credit), Money.ZERO);
      expect(totalDebit.equals(totalCredit)).toBe(true);
    });

    it("appends a balanced 2-line fee pair when feeAmount is set and non-zero — 4 lines total", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(
        makeTransfer({ status: "APPROVED", amount: Money.fromInt(1000), feeAmount: Money.fromInt(50) }),
      );
      await service.post(em, "ext-transfer-1", "poster-1");
      expect(glAccountRepository.findByCodeOrFail).toHaveBeenCalledWith("5100", em);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toHaveLength(4);

      const [feeDebit, feeCredit] = draft.lines.slice(2);
      expect(feeDebit).toEqual(expect.objectContaining({ accountId: "bank-charges-acc", debit: Money.fromInt(50), credit: Money.ZERO }));
      expect(feeCredit).toEqual(expect.objectContaining({ accountId: "gl-source", debit: Money.ZERO, credit: Money.fromInt(50) }));

      const totalDebit = draft.lines.reduce((sum: Money, l: { debit: Money }) => sum.add(l.debit), Money.ZERO);
      const totalCredit = draft.lines.reduce((sum: Money, l: { credit: Money }) => sum.add(l.credit), Money.ZERO);
      expect(totalDebit.equals(totalCredit)).toBe(true);
    });

    it("does not append a fee leg when feeAmount is exactly zero", async () => {
      transferRepository.findByIdOrFail.mockResolvedValue(
        makeTransfer({ status: "APPROVED", amount: Money.fromInt(1000), feeAmount: Money.ZERO }),
      );
      await service.post(em, "ext-transfer-1", "poster-1");
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toHaveLength(2);
    });

    it("allocates the real BANK_EXTERNAL_TRANSFER number, sets status=POSTED, and stamps journal_id", async () => {
      const result = await service.post(em, "ext-transfer-1", "poster-1");
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "BANK_EXTERNAL_TRANSFER");
      expect(result.number).toBe("EXT-000001");
      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
    });
  });
});
