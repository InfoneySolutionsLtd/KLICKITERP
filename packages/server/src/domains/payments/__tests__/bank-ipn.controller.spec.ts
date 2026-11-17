import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BankIpnController } from "../api/bank-ipn.controller";
import { BANK_IPN_SYSTEM_ACTOR_SETTING_KEY } from "../application/kcb-ipn.service";
import { MPESA_SYSTEM_ACTOR_SETTING_KEY } from "../application/mpesa.service";
import { PayBankIpnEntity } from "../domain/pay-bank-ipn.entity";

const BANK_USER = "0194c1de-0000-7000-8000-0000000000aa";
const MPESA_USER = "0194c1de-0000-7000-8000-0000000000bb";

describe("BankIpnController", () => {
  let ipnRepository: { findPaginated: jest.Mock };
  let settings: Record<string, unknown>;
  let settingsService: { getTyped: jest.Mock; set: jest.Mock };
  let users: Record<string, { id: string; fullName: string; status: string }>;
  let userRepository: { findOne: jest.Mock };
  let controller: BankIpnController;

  beforeEach(() => {
    ipnRepository = { findPaginated: jest.fn(async () => ({ items: [], total: 0 })) };
    settings = {};
    settingsService = {
      getTyped: jest.fn(async (key: string, fallback: unknown) => (key in settings ? settings[key] : fallback)),
      set: jest.fn(async (key: string, value: unknown) => {
        settings[key] = value;
      }),
    };
    users = {
      [BANK_USER]: { id: BANK_USER, fullName: "KCB Receipting", status: "ACTIVE" },
      [MPESA_USER]: { id: MPESA_USER, fullName: "M-Pesa System", status: "ACTIVE" },
    };
    userRepository = { findOne: jest.fn(async ({ where }: { where: { id: string } }) => users[where.id] ?? null) };
    controller = new BankIpnController(ipnRepository as never, settingsService as never, userRepository as never);
  });

  describe("list", () => {
    it("pages newest-first with the filters, and returns plain views (amounts as text, no raw payload)", async () => {
      const row = {
        id: "ipn-1",
        provider: "KCB",
        kind: "ACCOUNT",
        externalRef: "FT1",
        amount: Money.fromInt(1500),
        currency: "KES",
        customerReference: "1234",
        payerName: "Peter Bor",
        payerMsisdnMasked: "*********123",
        narration: null,
        creditAccount: "1234567890",
        transactionAt: new Date("2026-11-17T07:30:00Z"),
        state: "SUSPENDED",
        receiptId: null,
        suspenseItemId: "s-1",
        note: "No student matches",
        createdAt: new Date("2026-11-17T07:31:00Z"),
        raw: { customerMobileNumber: "254700000123" },
      } as unknown as PayBankIpnEntity;
      ipnRepository.findPaginated.mockResolvedValueOnce({ items: [row], total: 41 });

      const result = await controller.list({ page: 3, pageSize: 20, sortDir: "ASC", state: "SUSPENDED", kind: "ACCOUNT", q: "peter" });

      expect(ipnRepository.findPaginated).toHaveBeenCalledWith({ state: "SUSPENDED", kind: "ACCOUNT", q: "peter" }, { skip: 40, take: 20 });
      expect(result.total).toBe(41);
      expect(result.items[0]).toMatchObject({ amount: "1500.0000", transactionAt: "2026-11-17T07:30:00.000Z", note: "No student matches", suspenseItemId: "s-1" });
      expect(result.items[0]).not.toHaveProperty("raw");
      expect(JSON.stringify(result)).not.toContain("254700000123"); // the full phone number never leaves the server
    });
  });

  describe("readiness", () => {
    it("not configured when neither setting is set", async () => {
      expect(await controller.readiness()).toEqual({ cashier: { configured: false, source: null, userId: null, userName: null, userActive: false } });
    });

    it("configured by the bank setting", async () => {
      settings[BANK_IPN_SYSTEM_ACTOR_SETTING_KEY] = BANK_USER;
      expect((await controller.readiness()).cashier).toEqual({ configured: true, source: "BANK", userId: BANK_USER, userName: "KCB Receipting", userActive: true });
    });

    it("falls back to the M-Pesa setting, and says so", async () => {
      settings[MPESA_SYSTEM_ACTOR_SETTING_KEY] = MPESA_USER;
      expect((await controller.readiness()).cashier).toMatchObject({ configured: true, source: "MPESA", userName: "M-Pesa System" });
    });

    it("the bank setting wins over the M-Pesa one", async () => {
      settings[BANK_IPN_SYSTEM_ACTOR_SETTING_KEY] = BANK_USER;
      settings[MPESA_SYSTEM_ACTOR_SETTING_KEY] = MPESA_USER;
      expect((await controller.readiness()).cashier.source).toBe("BANK");
    });

    it("a saved user who has since been suspended or removed is NOT 'configured' — receipts would fail", async () => {
      settings[BANK_IPN_SYSTEM_ACTOR_SETTING_KEY] = BANK_USER;
      users[BANK_USER].status = "SUSPENDED";
      expect((await controller.readiness()).cashier).toMatchObject({ configured: false, userId: BANK_USER, userActive: false });

      delete users[BANK_USER];
      expect((await controller.readiness()).cashier).toMatchObject({ configured: false, userName: null, userActive: false });
    });
  });

  describe("setCashier", () => {
    const req = { user: { sub: "admin-1" } } as never;

    it("saves an active user under the bank setting and reports the new state", async () => {
      const result = await controller.setCashier({ userId: BANK_USER }, req);

      expect(settingsService.set).toHaveBeenCalledWith(BANK_IPN_SYSTEM_ACTOR_SETTING_KEY, BANK_USER, false, "admin-1");
      expect(result.cashier).toMatchObject({ configured: true, source: "BANK", userName: "KCB Receipting" });
    });

    it("refuses a user who does not exist", async () => {
      await expect(controller.setCashier({ userId: "0194c1de-0000-7000-8000-0000000000ff" }, req)).rejects.toThrow(ValidationException);
      expect(settingsService.set).not.toHaveBeenCalled();
    });

    it("refuses a user who is not active", async () => {
      users[BANK_USER].status = "INVITED";
      await expect(controller.setCashier({ userId: BANK_USER }, req)).rejects.toThrow(/not an active user/);
      expect(settingsService.set).not.toHaveBeenCalled();
    });
  });
});
