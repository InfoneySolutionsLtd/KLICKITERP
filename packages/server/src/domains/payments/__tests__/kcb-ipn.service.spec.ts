import { createSign, generateKeyPairSync } from "node:crypto";
import { Logger } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { loadKcbPublicKey } from "../../../shared/integrations/kcb-buni/kcb-ipn-signature";
import { PayBankIpnEntity } from "../domain/pay-bank-ipn.entity";
import { PaySuspenseItemEntity } from "../domain/pay-suspense-item.entity";
import { BANK_IPN_SYSTEM_ACTOR_SETTING_KEY, BankIpnNotConfiguredException, KcbIpnService } from "../application/kcb-ipn.service";
import { MPESA_SYSTEM_ACTOR_SETTING_KEY } from "../application/mpesa.service";

// A throwaway key pair stands in for KCB's.
const kcb = generateKeyPairSync("rsa", { modulusLength: 2048 });
const forger = generateKeyPairSync("rsa", { modulusLength: 2048 });
const kcbPublicKey = loadKcbPublicKey(kcb.publicKey.export({ type: "spki", format: "pem" }).toString());

const BANK_ACCOUNT_ID = "0194c1de-0000-7000-8000-000000000001";

const ACCOUNT_BODY = {
  transactionReference: "FT000262556",
  requestId: "REQ-1",
  timestamp: "202607151030",
  transactionAmount: "1000",
  currency: "KES",
  customerReference: "1234",
  customerName: "Peter Bor",
  customerMobileNumber: "254711000123",
  narration: "School Fees",
  creditAccountIdentifier: "1234567890",
};

const TILL_BODY = {
  header: { messageID: "MSG-1", originatorConversationID: "CONV-1", timeStamp: "20260715103000" },
  requestPayload: {
    primaryData: { businessKey: "522533", businessKeyType: "notifyBiller" },
    additionalData: {
      notificationData: {
        businessKey: "1234",
        debitMSISDN: "254711000123",
        transactionAmt: "500",
        transactionDate: "Wed Jul 15 10:30:00 EAT 2026",
        transactionID: "TILL-777",
        firstName: "Jane",
        lastName: "Doe",
        currency: "KES",
      },
    },
  },
};

function send(body: unknown, privateKey = kcb.privateKey) {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = createSign("RSA-SHA256").update(raw).sign(privateKey).toString("base64");
  return { rawBody: raw, body: JSON.parse(raw.toString()) as unknown, signature };
}

/** In-memory stand-in for `pay_bank_ipn`, including its unique (provider, kind, ref) key. */
class FakeIpnRepository {
  rows = new Map<string, PayBankIpnEntity>();
  private seq = 0;
  private key = (p: string, k: string, r: string) => `${p}|${k}|${r}`;

  create = jest.fn(async (data: Partial<PayBankIpnEntity>) => {
    const key = this.key(data.provider!, data.kind!, data.externalRef!);
    if (this.rows.has(key)) throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    const row = { id: `ipn-${++this.seq}`, ...data } as PayBankIpnEntity;
    this.rows.set(key, row);
    return row;
  });
  findByExternalRef = jest.fn(async (p: string, k: string, r: string) => this.rows.get(this.key(p, k, r)) ?? null);
  findByExternalRefForUpdate = jest.fn(async (p: string, k: string, r: string) => this.rows.get(this.key(p, k, r)) ?? null);
  save = jest.fn(async (row: PayBankIpnEntity) => row);
}

describe("KcbIpnService", () => {
  let ipnRepository: FakeIpnRepository;
  let suspenseRepository: { create: jest.Mock };
  let receiptsService: { captureReceipt: jest.Mock };
  let studentRepository: { findByAdmissionNo: jest.Mock };
  let invoiceRepository: { findOpenForStudent: jest.Mock };
  let settings: Record<string, unknown>;
  let settingsService: { getTyped: jest.Mock };
  let resolved: { configId: string; config: Record<string, unknown>; ipnPublicKey: unknown; tokenProvider: object } | null;
  let configResolver: { resolve: jest.Mock };
  let appConfig: { nodeEnv: string };
  let service: KcbIpnService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    ipnRepository = new FakeIpnRepository();
    suspenseRepository = { create: jest.fn(async (data) => ({ id: "suspense-1", ...data }) as PaySuspenseItemEntity) };
    receiptsService = { captureReceipt: jest.fn(async () => ({ id: "receipt-1", number: "PAY-000001" })) };
    studentRepository = {
      findByAdmissionNo: jest.fn(async (admissionNo: string) => (admissionNo === "1234" ? { id: "student-1", firstName: "John", lastName: "Doe" } : null)),
    };
    invoiceRepository = { findOpenForStudent: jest.fn(async () => []) };
    settings = { [BANK_IPN_SYSTEM_ACTOR_SETTING_KEY]: "system-actor-bank" };
    settingsService = { getTyped: jest.fn(async (key: string, fallback: unknown) => (key in settings ? settings[key] : fallback)) };
    resolved = {
      configId: "cfg-1",
      config: { provider: "KCB_BUNI", bankAccountId: BANK_ACCOUNT_ID, ipnSkipSignatureVerification: false },
      ipnPublicKey: kcbPublicKey,
      tokenProvider: {},
    };
    configResolver = { resolve: jest.fn(async () => resolved) };
    appConfig = { nodeEnv: "development" };

    const dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) => work({} as EntityManager)),
    } as unknown as DataSource;

    service = new KcbIpnService(
      ipnRepository as never,
      suspenseRepository as never,
      receiptsService as never,
      studentRepository as never,
      invoiceRepository as never,
      settingsService as never,
      configResolver as never,
      appConfig as never,
      dataSource,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe("authentication", () => {
    it("refuses with 503 when KCB BUNI is not set up (KCB will retry later); nothing is stored", async () => {
      resolved = null;
      const attempt = service.handleAccountNotification(send(ACCOUNT_BODY));
      await expect(attempt).rejects.toBeInstanceOf(BankIpnNotConfiguredException);
      await expect(attempt).rejects.toMatchObject({ httpStatus: 503 });
      expect(ipnRepository.create).not.toHaveBeenCalled();
    });

    it("refuses when KCB's public key is not configured — it will not accept what it cannot verify", async () => {
      resolved!.ipnPublicKey = null;
      await expect(service.handleAccountNotification(send(ACCOUNT_BODY))).rejects.toThrow(/public key.*not set/);
      expect(ipnRepository.create).not.toHaveBeenCalled();
    });

    it("rejects a notification with no Signature header", async () => {
      const { rawBody, body } = send(ACCOUNT_BODY);
      await expect(service.handleAccountNotification({ rawBody, body, signature: undefined })).rejects.toBeInstanceOf(AuthenticationException);
      expect(ipnRepository.create).not.toHaveBeenCalled();
    });

    it("rejects a forged notification (signed with someone else's key) and stores nothing", async () => {
      await expect(service.handleAccountNotification(send(ACCOUNT_BODY, forger.privateKey))).rejects.toThrow("Invalid Signature");
      expect(ipnRepository.create).not.toHaveBeenCalled();
      expect(receiptsService.captureReceipt).not.toHaveBeenCalled();
    });

    it("rejects a genuine signature replayed over an altered amount", async () => {
      const genuine = send(ACCOUNT_BODY);
      const altered = { ...ACCOUNT_BODY, transactionAmount: "900000" };
      await expect(
        service.handleAccountNotification({ rawBody: Buffer.from(JSON.stringify(altered)), body: altered, signature: genuine.signature }),
      ).rejects.toThrow("Invalid Signature");
      expect(ipnRepository.create).not.toHaveBeenCalled();
    });

    it("sandbox escape hatch: skips the check when ipnSkipSignatureVerification is on outside production", async () => {
      resolved!.config.ipnSkipSignatureVerification = true;
      resolved!.ipnPublicKey = null;
      const { rawBody, body } = send(ACCOUNT_BODY);
      await expect(service.handleAccountNotification({ rawBody, body, signature: undefined })).resolves.toMatchObject({ statusCode: "0" });
    });

    it("...but production ignores the escape hatch and still demands a verified signature", async () => {
      resolved!.config.ipnSkipSignatureVerification = true;
      appConfig.nodeEnv = "production";
      const { rawBody, body } = send(ACCOUNT_BODY);
      await expect(service.handleAccountNotification({ rawBody, body, signature: undefined })).rejects.toBeInstanceOf(Error);
      expect(ipnRepository.create).not.toHaveBeenCalled();
    });

    it("rejects a malformed body (after the signature passes) without storing it", async () => {
      const bad = { ...ACCOUNT_BODY, transactionReference: undefined };
      await expect(service.handleAccountNotification(send(bad))).rejects.toBeInstanceOf(ValidationException);
      expect(ipnRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("account notification (money into the school's KCB account)", () => {
    it("matches the student by admission number and captures ONE BANK_TRANSFER receipt into the configured bank account", async () => {
      const ack = await service.handleAccountNotification(send(ACCOUNT_BODY));

      expect(receiptsService.captureReceipt).toHaveBeenCalledTimes(1);
      const [, input] = receiptsService.captureReceipt.mock.calls[0];
      expect(input).toMatchObject({
        studentId: "student-1",
        payerName: "Peter Bor",
        // 15 Jul 2026 10:30 EAT
        receiptDate: "2026-07-15",
        cashierId: "system-actor-bank",
        idempotencyKey: "kcb-ipn-ACCOUNT-FT000262556",
        splits: [{ method: "BANK_TRANSFER", bankAccountId: BANK_ACCOUNT_ID, externalRef: "FT000262556" }],
      });
      expect((input.total as Money).toDecimalString()).toBe("1000.0000");

      const row = [...ipnRepository.rows.values()][0];
      expect(row).toMatchObject({ state: "MATCHED", receiptId: "receipt-1", note: null, kind: "ACCOUNT", provider: "KCB" });
      expect(ack).toEqual({ transactionID: "REQ-1", statusCode: "0", statusMessage: "Notification received successfully" });
    });

    it("stores only a masked phone number on the log row (the full one stays inside the verbatim payload)", async () => {
      await service.handleAccountNotification(send(ACCOUNT_BODY));
      const row = [...ipnRepository.rows.values()][0];
      expect(row.payerMsisdnMasked).toBe("*********123");
      expect(row.raw.customerMobileNumber).toBe("254711000123");
    });

    it("a re-sent notification has NO second effect: one receipt, one row, same acknowledgement", async () => {
      const first = await service.handleAccountNotification(send(ACCOUNT_BODY));
      const second = await service.handleAccountNotification(send(ACCOUNT_BODY));

      expect(receiptsService.captureReceipt).toHaveBeenCalledTimes(1);
      expect(ipnRepository.rows.size).toBe(1);
      expect(second).toEqual(first);
    });

    it("finishes a notification that was stored but never posted (a crash between the two steps) when KCB re-sends it", async () => {
      // The first delivery stored the row, then the process died before posting.
      receiptsService.captureReceipt.mockRejectedValueOnce(new Error("process died"));
      await service.handleAccountNotification(send(ACCOUNT_BODY));
      const row = [...ipnRepository.rows.values()][0];
      expect(row.state).toBe("SUSPENDED"); // sent to suspense rather than left half-done

      // A row stuck in RECEIVED (the crash happened before even the suspense step) is picked up on the retry:
      row.state = "RECEIVED";
      row.suspenseItemId = null;
      receiptsService.captureReceipt.mockResolvedValueOnce({ id: "receipt-2", number: "PAY-000002" });
      await service.handleAccountNotification(send(ACCOUNT_BODY));
      expect(row).toMatchObject({ state: "MATCHED", receiptId: "receipt-2" });
    });

    it("answers with the row id when the notification carries no requestId", async () => {
      const ack = await service.handleAccountNotification(send({ ...ACCOUNT_BODY, requestId: undefined }));
      expect(ack.transactionID).toBe("ipn-1");
    });
  });

  describe("till notification (Paybill / Lipa na KCB till — M-Pesa)", () => {
    it("captures ONE MPESA_TILL receipt, no bank account needed", async () => {
      resolved!.config.bankAccountId = undefined;
      const ack = await service.handleTillNotification(send(TILL_BODY));

      const [, input] = receiptsService.captureReceipt.mock.calls[0];
      expect(input).toMatchObject({
        studentId: "student-1",
        payerName: "Jane Doe",
        receiptDate: "2026-07-15",
        idempotencyKey: "kcb-ipn-TILL-TILL-777",
        splits: [{ method: "MPESA_TILL", externalRef: "TILL-777" }],
      });
      expect(ack).toEqual({
        header: { messageID: "MSG-1", originatorConversationID: "CONV-1", statusCode: "0", statusMessage: "Notification received successfully" },
        responsePayload: { transactionInfo: { transactionId: "ipn-1" } },
      });
    });

    it("de-duplicates a re-sent till notification", async () => {
      await service.handleTillNotification(send(TILL_BODY));
      await service.handleTillNotification(send(TILL_BODY));
      expect(receiptsService.captureReceipt).toHaveBeenCalledTimes(1);
    });

    it("an account and a till notification with the same id are different payments (kind is part of the key)", async () => {
      await service.handleAccountNotification(send({ ...ACCOUNT_BODY, transactionReference: "SAME-ID" }));
      const till = structuredClone(TILL_BODY);
      till.requestPayload.additionalData.notificationData.transactionID = "SAME-ID";
      await service.handleTillNotification(send(till));
      expect(receiptsService.captureReceipt).toHaveBeenCalledTimes(2);
    });
  });

  describe("money that cannot be receipted automatically goes to suspense — never lost", () => {
    async function expectParked(promise: Promise<unknown>, noteFragment: RegExp, source: "BANK" | "C2B" = "BANK") {
      // KCB is still told "received" (statusCode "0" — top level for an account ack, inside `header` for a till ack)
      expect(JSON.stringify(await promise)).toContain('"statusCode":"0"');
      expect(receiptsService.captureReceipt).not.toHaveBeenCalled();
      const row = [...ipnRepository.rows.values()][0];
      expect(row.state).toBe("SUSPENDED");
      expect(row.note).toMatch(noteFragment);
      expect(row.suspenseItemId).toBe("suspense-1");
      expect(suspenseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ source, state: "OPEN", externalRef: row.externalRef, amount: row.amount }),
        expect.anything(),
      );
    }

    it("a reference that matches no student", async () => {
      await expectParked(service.handleAccountNotification(send({ ...ACCOUNT_BODY, customerReference: "99999" })), /No student matches the reference "99999"/);
    });

    it("a notification with no customer reference at all", async () => {
      await expectParked(service.handleAccountNotification(send({ ...ACCOUNT_BODY, customerReference: undefined })), /no customer reference/);
    });

    it("a currency other than KES", async () => {
      await expectParked(service.handleAccountNotification(send({ ...ACCOUNT_BODY, currency: "USD" })), /Currency USD is not KES/);
    });

    it("an account credit when the school's bank account is not set in the integration settings", async () => {
      resolved!.config.bankAccountId = undefined;
      await expectParked(service.handleAccountNotification(send(ACCOUNT_BODY)), /bankAccountId/);
    });

    it("no system cashier configured (names the Settings key to set)", async () => {
      settings = {};
      await expectParked(service.handleAccountNotification(send(ACCOUNT_BODY)), new RegExp(BANK_IPN_SYSTEM_ACTOR_SETTING_KEY));
    });

    it("a till (M-Pesa) payment is parked as source C2B so it resolves later as an M-Pesa receipt", async () => {
      await expectParked(service.handleTillNotification(send({ ...TILL_BODY, requestPayload: { ...TILL_BODY.requestPayload, additionalData: { notificationData: { ...TILL_BODY.requestPayload.additionalData.notificationData, businessKey: "nobody" } } } })), /No student matches/, "C2B");
    });

    it("posting itself failing (e.g. a closed accounting period) also parks it, with the reason", async () => {
      receiptsService.captureReceipt.mockRejectedValueOnce(new Error("Accounting period 2026-07 is closed"));
      await expect(service.handleAccountNotification(send(ACCOUNT_BODY))).resolves.toMatchObject({ statusCode: "0" });
      const row = [...ipnRepository.rows.values()][0];
      expect(row.state).toBe("SUSPENDED");
      expect(row.note).toBe("Automatic posting failed: Accounting period 2026-07 is closed");
    });

    it("stamps the parked item with the real bank account id, so a later manual match posts to the right account", async () => {
      await service.handleAccountNotification(send({ ...ACCOUNT_BODY, customerReference: "99999" }));
      const [data] = suspenseRepository.create.mock.calls[0];
      expect(data.raw).toMatchObject({ transactionReference: "FT000262556", klickit: { provider: "KCB", kind: "ACCOUNT", bankAccountId: BANK_ACCOUNT_ID } });
    });

    it("a re-sent notification that was already parked is NOT parked twice", async () => {
      await service.handleAccountNotification(send({ ...ACCOUNT_BODY, customerReference: "99999" }));
      await service.handleAccountNotification(send({ ...ACCOUNT_BODY, customerReference: "99999" }));
      expect(suspenseRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("system cashier", () => {
    it("falls back to the M-Pesa system actor when no bank-specific one is set", async () => {
      settings = { [MPESA_SYSTEM_ACTOR_SETTING_KEY]: "system-actor-mpesa" };
      await service.handleAccountNotification(send(ACCOUNT_BODY));
      expect(receiptsService.captureReceipt.mock.calls[0][1].cashierId).toBe("system-actor-mpesa");
    });

    it("prefers the bank-specific one", async () => {
      settings = { [BANK_IPN_SYSTEM_ACTOR_SETTING_KEY]: "system-actor-bank", [MPESA_SYSTEM_ACTOR_SETTING_KEY]: "system-actor-mpesa" };
      await service.handleAccountNotification(send(ACCOUNT_BODY));
      expect(receiptsService.captureReceipt.mock.calls[0][1].cashierId).toBe("system-actor-bank");
    });
  });
});
