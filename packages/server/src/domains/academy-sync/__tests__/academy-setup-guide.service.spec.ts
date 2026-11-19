/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { MpesaLogOnlyAdapter } from "../../payments";
import { AcademySetupGuideService } from "../application/academy-setup-guide.service";

const CASHIER = "u0000000-0000-4000-8000-0000000000aa";

interface Over {
  connected?: boolean;
  firstImportConfirmedAt?: Date | null;
  mappedStudents?: number;
  link?: { registered: boolean; lastVerifyOk: boolean | null };
  publish?: { enabled: boolean; lastPublishOk: boolean | null; rejected: number };
  receipts?: { canIssue: boolean; complete: boolean; issues: string[] } | Error;
  parent?: { enabled: boolean; actor: { configured: boolean } };
  provider?: unknown | Error;
  cashierSetting?: string | null;
  user?: { id: string; fullName: string; status: string } | null;
  fee?: { hasCurrentTerm: boolean; optionalItemLines: number; activeRoutes: number };
}

function harness(over: Over = {}) {
  const syncService = {
    getStatus: jest.fn(async () => ({
      connected: over.connected ?? true,
      academySchoolCode: "KAS-2414",
      state: { firstImportConfirmedAt: over.firstImportConfirmedAt === undefined ? new Date() : over.firstImportConfirmedAt },
      mappedStudents: over.mappedStudents ?? 50,
    })),
  };
  const linkService = { getStatus: jest.fn(async () => over.link ?? { registered: true, lastVerifyOk: true }) };
  const publishService = { getStatus: jest.fn(async () => over.publish ?? { enabled: true, lastPublishOk: true, rejected: 0 }) };
  const receiptService = {
    readiness: jest.fn(async () => {
      if (over.receipts instanceof Error) throw over.receipts;
      return over.receipts ?? { canIssue: true, complete: true, issues: [] };
    }),
  };
  const parentInvoicing = { getStatus: jest.fn(async () => over.parent ?? { enabled: true, actor: { configured: true } }) };
  const adapterResolver = {
    resolve: jest.fn(async () => {
      if (over.provider instanceof Error) throw over.provider;
      return over.provider ?? { stkPush: jest.fn() };
    }),
  };
  const settingsService = {
    getTyped: jest.fn(async () => (over.cashierSetting === undefined ? CASHIER : over.cashierSetting)),
    set: jest.fn(async () => undefined),
  };
  const facts = { feeOptionFacts: jest.fn(async () => over.fee ?? { hasCurrentTerm: true, optionalItemLines: 2, activeRoutes: 1 }) };
  const users = {
    findUserBrief: jest.fn(async (id: string) => (over.user === undefined ? { id, fullName: "Service Account", status: "ACTIVE" } : over.user)),
  };
  const service = new AcademySetupGuideService(
    syncService as any,
    linkService as any,
    publishService as any,
    receiptService as any,
    parentInvoicing as any,
    adapterResolver as any,
    settingsService as any,
    facts as any,
    users as any,
  );
  return { service, settingsService, adapterResolver, users, receiptService };
}

const stateOf = (guide: { steps: Array<{ key: string; state: string; detail: string | null }> }, key: string) => {
  const step = guide.steps.find((s) => s.key === key)!;
  return `${step.state}${step.detail ? `:${step.detail}` : ""}`;
};

describe("AcademySetupGuideService.getGuide", () => {
  it("everything in place: 8 of 8 and nothing next", async () => {
    const guide = await harness().service.getGuide();
    expect(guide).toMatchObject({ doneCount: 8, totalCount: 8, nextStepKey: null });
    expect(guide.payments).toEqual({ providerConfigured: true, cashier: { configured: true, userId: CASHIER, userName: "Service Account", userActive: true } });
  });

  it("not connected: the guide is still returned, starting at Connect", async () => {
    const guide = await harness({ connected: false, firstImportConfirmedAt: null, mappedStudents: 0, link: { registered: false, lastVerifyOk: null }, publish: { enabled: false, lastPublishOk: null, rejected: 0 } }).service.getGuide();
    expect(guide.nextStepKey).toBe("CONNECT");
    expect(stateOf(guide, "CONNECT")).toBe("TODO:NOT_CONNECTED");
    expect(stateOf(guide, "IMPORT_STUDENTS")).toBe("LOCKED");
  });

  it("reads the first import from the sync state and the student count from the links", async () => {
    expect(stateOf(await harness({ firstImportConfirmedAt: null }).service.getGuide(), "IMPORT_STUDENTS")).toBe("TODO:NOT_IMPORTED");
    expect(stateOf(await harness({ mappedStudents: 0 }).service.getGuide(), "IMPORT_STUDENTS")).toBe("ATTENTION:NO_STUDENTS_LINKED");
  });

  it("passes the address test result, the publishing state and the receipt readiness through", async () => {
    const failing = await harness({ link: { registered: true, lastVerifyOk: false }, publish: { enabled: true, lastPublishOk: false, rejected: 0 } }).service.getGuide();
    expect(stateOf(failing, "REACH_ERP")).toBe("ATTENTION:TEST_FAILED");
    expect(stateOf(failing, "PUBLISH_INVOICES")).toBe("ATTENTION:PUBLISH_FAILED");

    const receipts = await harness({ receipts: { canIssue: true, complete: false, issues: ["QR_ADDRESS_NOT_PUBLIC"] } }).service.getGuide();
    expect(stateOf(receipts, "RECEIPTS")).toBe("ATTENTION:QR_ADDRESS_NOT_PUBLIC");
  });

  it("receipts cannot be started while the Academy cannot reach this ERP (it downloads them through that address)", async () => {
    const guide = await harness({ link: { registered: true, lastVerifyOk: false }, receipts: { canIssue: false, complete: false, issues: ["NO_LOGO", "NO_LETTERHEAD"] } }).service.getGuide();
    expect(stateOf(guide, "RECEIPTS")).toBe("LOCKED");
    expect(guide.steps.find((s) => s.key === "RECEIPTS")!.blockedBy).toEqual(["REACH_ERP"]);
  });

  it("a problem looking at the receipt setup only affects that step (it says it could not check), not the whole guide", async () => {
    const guide = await harness({ receipts: new Error("branding table missing") }).service.getGuide();
    expect(stateOf(guide, "RECEIPTS")).toBe("ATTENTION:CANNOT_CHECK");
    expect(guide.totalCount).toBe(8);
    expect(JSON.stringify(guide)).not.toContain("branding table missing");
  });

  it("parent invoicing: switch and invoice user come from the parent-invoicing settings", async () => {
    expect(stateOf(await harness({ parent: { enabled: false, actor: { configured: false } } }).service.getGuide(), "PARENT_INVOICING")).toBe("TODO:NOT_ON_NO_INVOICE_USER");
    expect(stateOf(await harness({ parent: { enabled: true, actor: { configured: false } } }).service.getGuide(), "PARENT_INVOICING")).toBe("ATTENTION:NO_INVOICE_USER");
  });

  it("fee options come from the books' facts", async () => {
    expect(stateOf(await harness({ fee: { hasCurrentTerm: false, optionalItemLines: 0, activeRoutes: 0 } }).service.getGuide(), "FEE_OPTIONS")).toBe("TODO:NO_CURRENT_TERM");
    expect(stateOf(await harness({ fee: { hasCurrentTerm: true, optionalItemLines: 0, activeRoutes: 0 } }).service.getGuide(), "FEE_OPTIONS")).toBe("TODO:NO_OPTIONAL_ITEMS");
  });

  it("never writes anything just by being read", async () => {
    const h = harness({ cashierSetting: null });
    await h.service.getGuide();
    expect(h.settingsService.set).not.toHaveBeenCalled();
  });
});

describe("AcademySetupGuideService — the M-Pesa provider", () => {
  it("the log-only fallback (which sends nothing) is NOT a configured provider", async () => {
    const guide = await harness({ provider: new MpesaLogOnlyAdapter() }).service.getGuide();
    expect(guide.payments.providerConfigured).toBe(false);
    expect(stateOf(guide, "PAYMENTS")).toBe("TODO:NO_PROVIDER");
  });

  it("a real provider (Daraja or KCB) is", async () => {
    expect((await harness({ provider: { stkPush: jest.fn() } }).service.getGuide()).payments.providerConfigured).toBe(true);
  });

  it("a provider that cannot even be resolved counts as not configured, and the guide still loads", async () => {
    const guide = await harness({ provider: new Error("cannot decrypt config") }).service.getGuide();
    expect(guide.payments.providerConfigured).toBe(false);
    expect(JSON.stringify(guide)).not.toContain("decrypt");
  });
});

describe("AcademySetupGuideService — the M-Pesa cashier", () => {
  it("not set", async () => {
    const guide = await harness({ cashierSetting: null }).service.getGuide();
    expect(guide.payments.cashier).toEqual({ configured: false, userId: null, userName: null, userActive: false });
    expect(stateOf(guide, "PAYMENTS")).toBe("TODO:NO_CASHIER");
  });

  it("set to a user who is no longer active: reported as not usable, naming the user", async () => {
    const guide = await harness({ user: { id: CASHIER, fullName: "Left School", status: "SUSPENDED" } }).service.getGuide();
    expect(guide.payments.cashier).toEqual({ configured: false, userId: CASHIER, userName: "Left School", userActive: false });
    expect(stateOf(guide, "PAYMENTS")).toBe("TODO:NO_CASHIER");
  });

  it("set to a user that does not exist: not usable, no name", async () => {
    const guide = await harness({ user: null }).service.getGuide();
    expect(guide.payments.cashier).toEqual({ configured: false, userId: CASHIER, userName: null, userActive: false });
  });
});

describe("AcademySetupGuideService.setPaymentsCashier", () => {
  it("saves an active user under the existing M-Pesa system-cashier key, plain, remembering who chose it, and returns the refreshed guide", async () => {
    const h = harness({ cashierSetting: null });
    h.settingsService.set.mockImplementation(async () => {
      h.settingsService.getTyped.mockResolvedValue(CASHIER); // what a read after the save sees
    });
    const guide = await h.service.setPaymentsCashier(CASHIER, "admin-1");
    expect(h.settingsService.set).toHaveBeenCalledWith("payments.mpesa_system_actor_user_id", CASHIER, false, "admin-1");
    expect(guide.payments.cashier).toMatchObject({ configured: true, userId: CASHIER });
  });

  it("refuses a user that does not exist, and saves nothing", async () => {
    const h = harness({ user: null });
    await expect(h.service.setPaymentsCashier(CASHIER, "admin-1")).rejects.toBeInstanceOf(ValidationException);
    expect(h.settingsService.set).not.toHaveBeenCalled();
  });

  it("refuses a user who is not active, naming them, and saves nothing", async () => {
    const h = harness({ user: { id: CASHIER, fullName: "Left School", status: "DEACTIVATED" } });
    await expect(h.service.setPaymentsCashier(CASHIER, "admin-1")).rejects.toThrow(/Left School is not an active user/);
    expect(h.settingsService.set).not.toHaveBeenCalled();
  });
});
