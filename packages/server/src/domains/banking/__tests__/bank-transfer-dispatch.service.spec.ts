import { Logger } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { KcbApiResponse } from "../../../shared/integrations/kcb-buni/kcb-buni-api.client";
import { Money } from "../../../shared/money/money";
import { BankTransferDispatchService } from "../application/bank-transfer-dispatch.service";
import { BANK_DISPATCH_ACTIVE_STATUSES, BankExternalTransferDispatchEntity } from "../domain/bank-external-transfer-dispatch.entity";

/** In-memory stand-in for the table, including the two unique indexes the real one enforces. */
class FakeDispatchRepository {
  rows: BankExternalTransferDispatchEntity[] = [];
  log: string[] = [];

  create = jest.fn(async (data: Partial<BankExternalTransferDispatchEntity>) => {
    if (this.rows.some((r) => r.provider === data.provider && r.reference === data.reference)) {
      throw Object.assign(new Error("duplicate key"), { code: "23505", constraint: "uq_bank_ext_transfer_dispatch_ref" });
    }
    if (this.rows.some((r) => r.transferId === data.transferId && BANK_DISPATCH_ACTIVE_STATUSES.includes(r.status))) {
      throw Object.assign(new Error("duplicate key"), { code: "23505", constraint: "uq_bank_ext_transfer_dispatch_active" });
    }
    const row = { createdAt: new Date("2026-11-17T08:00:00Z"), ...data } as BankExternalTransferDispatchEntity;
    this.rows.push(row);
    this.log.push("recorded");
    return row;
  });
  findByIdOrFail = jest.fn(async (id: string) => {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`no dispatch ${id}`);
    return row;
  });
  listForTransfer = jest.fn(async (transferId: string) => this.rows.filter((r) => r.transferId === transferId));
  save = jest.fn(async (row: BankExternalTransferDispatchEntity) => row);
}

const KCB_RESPONSE_OK: KcbApiResponse = {
  status: 200,
  json: { header: { messageID: "m", statusCode: "0", statusMessage: "Success", statusDescription: "Success", retrievalRefNumber: "FT22006670X0" } },
  text: "",
};

describe("BankTransferDispatchService — sending an approved transfer through KCB Funds Transfer", () => {
  let dispatches: FakeDispatchRepository;
  let transfer: Record<string, unknown>;
  let account: Record<string, unknown>;
  let transferRepository: { findByIdOrFail: jest.Mock };
  let accountRepository: { findByIdOrFail: jest.Mock };
  let kcb: { configId: string; config: Record<string, unknown>; tokenProvider: object; ipnPublicKey: null } | null;
  let postJson: jest.Mock;
  let service: BankTransferDispatchService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    dispatches = new FakeDispatchRepository();
    transfer = {
      id: "transfer-1",
      number: "EXT-000042",
      status: "APPROVED",
      sourceAccountId: "acct-1",
      beneficiaryName: "ACME SUPPLIES LTD",
      beneficiaryAccountNo: "909099090",
      referenceNo: "INV-7788",
      amount: Money.fromDecimalString("25000.50"),
    };
    account = { id: "acct-1", name: "KCB Main", accountNo: "37890012" };
    transferRepository = { findByIdOrFail: jest.fn(async () => transfer) };
    accountRepository = { findByIdOrFail: jest.fn(async () => account) };
    kcb = {
      configId: "cfg-1",
      config: { companyCode: "KE0010001", fundsTransferType: "IF", fundsTransferEnabled: true },
      tokenProvider: {},
      ipnPublicKey: null,
    };
    postJson = jest.fn(async () => {
      dispatches.log.push("called KCB");
      return KCB_RESPONSE_OK;
    });
    const dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) => work({} as EntityManager)),
    } as unknown as DataSource;
    service = new BankTransferDispatchService(
      transferRepository as never,
      accountRepository as never,
      dispatches as never,
      { resolve: jest.fn(async () => kcb) } as never,
      dataSource,
    );
    jest.spyOn(service as unknown as { createClient: () => unknown }, "createClient").mockReturnValue({ postJson });
  });

  afterEach(() => jest.restoreAllMocks());

  describe("what is sent", () => {
    it("sends KCB's Funds Transfer request, the attempt recorded BEFORE the bank is called", async () => {
      const result = await service.dispatch("transfer-1", "user-1");

      expect(dispatches.log).toEqual(["recorded", "called KCB"]);
      const [path, body] = postJson.mock.calls[0];
      expect(path).toBe("/fundstransfer/1.0.0/api/v1/transfer");
      expect(body).toMatchObject({
        companyCode: "KE0010001",
        transactionType: "IF",
        debitAccountNumber: "37890012",
        creditAccountNumber: "909099090",
        debitAmount: 25000.5,
        paymentDetails: "INV-7788",
        currency: "KES",
        beneficiaryDetails: "ACME SUPPLIES LTD",
      });
      expect(body).not.toHaveProperty("beneficiaryBankCode");
      expect(body.transactionReference).toMatch(/^FT[0-9A-F]{10}$/);
      expect(result).toMatchObject({ status: "SENT", bankRef: "FT22006670X0", note: null, reference: body.transactionReference });
    });

    it("applies the per-send transaction type and beneficiary bank code, and keeps text within KCB's 35-character limit", async () => {
      transfer.beneficiaryName = "A".repeat(50);
      transfer.referenceNo = null;
      await service.dispatch("transfer-1", "user-1", { transactionType: "OT", beneficiaryBankCode: "01" });

      const body = postJson.mock.calls[0][1];
      expect(body).toMatchObject({ transactionType: "OT", beneficiaryBankCode: "01", paymentDetails: "EXT-000042" });
      expect(body.beneficiaryDetails).toHaveLength(35);
    });

    it("also works for a transfer that is already POSTED", async () => {
      transfer.status = "POSTED";
      await expect(service.dispatch("transfer-1", "user-1")).resolves.toMatchObject({ status: "SENT" });
    });

    it("keeps the exact request that was sent", async () => {
      const result = await service.dispatch("transfer-1", "user-1");
      expect(result.request).toBe(postJson.mock.calls[0][1]);
    });
  });

  describe("refuses, without calling the bank or recording anything", () => {
    async function expectRefused(message: RegExp, errorType: new (...args: never[]) => Error = ValidationException) {
      await expect(service.dispatch("transfer-1", "user-1")).rejects.toThrow(message);
      await expect(service.dispatch("transfer-1", "user-1")).rejects.toBeInstanceOf(errorType);
      expect(postJson).not.toHaveBeenCalled();
      expect(dispatches.rows).toHaveLength(0);
    }

    it("when KCB BUNI is not set up", async () => {
      kcb = null;
      await expectRefused(/not set up/);
    });

    it("when sending money is switched off in the KCB settings (the default)", async () => {
      kcb!.config.fundsTransferEnabled = false;
      await expectRefused(/switched off/);
    });

    it("when no company code is configured", async () => {
      kcb!.config.companyCode = undefined;
      await expectRefused(/companyCode/);
    });

    it.each([["DRAFT"], ["PENDING_APPROVAL"]])("a transfer that has not been approved (%s)", async (status) => {
      transfer.status = status;
      await expectRefused(/Only an approved transfer/);
    });

    it("a source account with no account number", async () => {
      account.accountNo = null;
      await expectRefused(/has no account number/);
    });

    it("account numbers longer than KCB accepts (10 characters)", async () => {
      account.accountNo = "12345678901";
      await expectRefused(/up to 10 characters/);
      account.accountNo = "37890012";
      transfer.beneficiaryAccountNo = "12345678901";
      await expectRefused(/beneficiary's has 11/);
    });

    it("an amount finer than cents (a float could misstate it)", async () => {
      transfer.amount = Money.fromDecimalString("100.0001");
      await expectRefused(/to the cent/);
    });
  });

  describe("one attempt at a time — a transfer is never paid twice", () => {
    it("two clicks at once: exactly ONE reaches the bank, the other is told it is already in progress", async () => {
      const results = await Promise.allSettled([service.dispatch("transfer-1", "user-1"), service.dispatch("transfer-1", "user-2")]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ConflictException);
      expect(postJson).toHaveBeenCalledTimes(1);
    });

    it("a transfer that was already SENT cannot be sent again", async () => {
      await service.dispatch("transfer-1", "user-1");
      await expect(service.dispatch("transfer-1", "user-1")).rejects.toBeInstanceOf(ConflictException);
      expect(postJson).toHaveBeenCalledTimes(1);
    });

    it("each attempt gets its own reference", async () => {
      postJson.mockResolvedValueOnce({ status: 400, json: { message: "Bad Request" }, text: "" });
      await service.dispatch("transfer-1", "user-1");
      await service.dispatch("transfer-1", "user-1");
      const [first, second] = dispatches.rows.map((r) => r.reference);
      expect(first).not.toBe(second);
    });
  });

  describe("what the bank's answer means for the money", () => {
    it("a business refusal (statusCode 1) is FAILED — nothing was paid — and a new attempt is then allowed", async () => {
      postJson.mockResolvedValueOnce({ status: 200, json: { header: { statusCode: "1", statusDescription: "Insufficient funds" } }, text: "" });

      const failed = await service.dispatch("transfer-1", "user-1");
      expect(failed).toMatchObject({ status: "FAILED", note: "KCB did not accept the transfer: Insufficient funds" });

      await expect(service.dispatch("transfer-1", "user-1")).resolves.toMatchObject({ status: "SENT" });
      expect(postJson).toHaveBeenCalledTimes(2);
    });

    it.each([[400], [401], [403], [429]])("a %i from the gateway is FAILED (it refused before acting) — safe to try again", async (status) => {
      postJson.mockResolvedValueOnce({ status, json: { message: "refused" }, text: "" });
      expect(await service.dispatch("transfer-1", "user-1")).toMatchObject({ status: "FAILED", note: "KCB refused the request: refused" });
    });

    it.each([[500], [502], [503], [504]])("a %i is UNKNOWN — KCB may have paid — and is NOT retried", async (status) => {
      postJson.mockResolvedValueOnce({ status, json: null, text: "oops" });

      const unknown = await service.dispatch("transfer-1", "user-1");

      expect(unknown.status).toBe("UNKNOWN");
      expect(unknown.note).toMatch(/MAY have gone through — do not send it again/);
      expect(unknown.note).toContain(unknown.reference);
      expect(postJson).toHaveBeenCalledTimes(1);
    });

    it("no answer at all (timeout) is UNKNOWN, not FAILED — and blocks a second send", async () => {
      postJson.mockRejectedValueOnce(new Error("timed out after 15000ms"));

      const unknown = await service.dispatch("transfer-1", "user-1");

      expect(unknown).toMatchObject({ status: "UNKNOWN" });
      expect(unknown.note).toContain("timed out after 15000ms");
      await expect(service.dispatch("transfer-1", "user-1")).rejects.toBeInstanceOf(ConflictException);
      expect(postJson).toHaveBeenCalledTimes(1);
    });

    it("a 200 with a reply we cannot read is UNKNOWN, not SENT", async () => {
      postJson.mockResolvedValueOnce({ status: 200, json: null, text: "<html>" });
      expect((await service.dispatch("transfer-1", "user-1")).status).toBe("UNKNOWN");
    });
  });

  describe("resolving an unknown outcome by hand", () => {
    async function unknownAttempt() {
      postJson.mockRejectedValueOnce(new Error("timed out"));
      return service.dispatch("transfer-1", "user-1");
    }

    it("SENT: KCB confirmed it paid — recorded with the note and the bank's reference", async () => {
      const unknown = await unknownAttempt();
      const resolved = await service.resolve(unknown.id, { outcome: "SENT", note: "KCB confirmed by phone", bankRef: "FT99" }, "user-2");

      expect(resolved).toMatchObject({ status: "SENT", bankRef: "FT99", updatedBy: "user-2" });
      expect(resolved.note).toContain("Resolved by hand as SENT: KCB confirmed by phone");
      await expect(service.dispatch("transfer-1", "user-1")).rejects.toBeInstanceOf(ConflictException); // paid: still cannot be sent again
    });

    it("FAILED: KCB confirmed it did not pay — a new attempt is now allowed", async () => {
      const unknown = await unknownAttempt();
      await service.resolve(unknown.id, { outcome: "FAILED", note: "Not on KCB's statement" }, "user-2");
      await expect(service.dispatch("transfer-1", "user-1")).resolves.toMatchObject({ status: "SENT" });
    });

    it("needs a note — a bare click is not a finding", async () => {
      const unknown = await unknownAttempt();
      await expect(service.resolve(unknown.id, { outcome: "SENT", note: "   " }, "user-2")).rejects.toBeInstanceOf(ValidationException);
    });

    it("cannot overwrite a definite outcome (SENT / FAILED)", async () => {
      const sent = await service.dispatch("transfer-1", "user-1");
      await expect(service.resolve(sent.id, { outcome: "FAILED", note: "changed my mind" }, "user-2")).rejects.toThrow(/Only an attempt with an unknown outcome/);
    });
  });
});
