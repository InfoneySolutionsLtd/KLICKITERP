import { buildSetupGuide, SETUP_STEP_KEYS, type SetupFacts, type SetupStepKey } from "../application/academy-setup-guide.util";

/** Everything set up. Each test starts from here (or from NOTHING) and changes only what it is about. */
const ALL_DONE: SetupFacts = {
  connected: true,
  firstImportConfirmed: true,
  mappedStudents: 120,
  link: { registered: true, lastVerifyOk: true },
  publish: { enabled: true, lastPublishOk: true, rejected: 0 },
  receipts: { canIssue: true, complete: true, issues: [] },
  payments: { providerConfigured: true, cashierConfigured: true },
  feeOptions: { hasCurrentTerm: true, optionalItemLines: 2, activeRoutes: 1 },
  parentInvoicing: { enabled: true, invoiceUserConfigured: true },
};

const NOTHING: SetupFacts = {
  connected: false,
  firstImportConfirmed: false,
  mappedStudents: 0,
  link: { registered: false, lastVerifyOk: null },
  publish: { enabled: false, lastPublishOk: null, rejected: 0 },
  receipts: { canIssue: false, complete: false, issues: ["NO_LOGO", "NO_LETTERHEAD", "QR_ADDRESS_NOT_PUBLIC"] },
  payments: { providerConfigured: false, cashierConfigured: false },
  feeOptions: { hasCurrentTerm: false, optionalItemLines: 0, activeRoutes: 0 },
  parentInvoicing: { enabled: false, invoiceUserConfigured: false },
};

const guideOf = (over: Partial<SetupFacts>, base: SetupFacts = ALL_DONE) => buildSetupGuide({ ...base, ...over });
const step = (guide: ReturnType<typeof buildSetupGuide>, key: SetupStepKey) => guide.steps.find((s) => s.key === key)!;
const stateOf = (guide: ReturnType<typeof buildSetupGuide>, key: SetupStepKey) => `${step(guide, key).state}${step(guide, key).detail ? `:${step(guide, key).detail}` : ""}`;

describe("the steps and their order", () => {
  it("lists the eight steps in the order a person should do them, with 4 needed to show invoices to parents", () => {
    const guide = buildSetupGuide(ALL_DONE);
    expect(guide.steps.map((s) => s.key)).toEqual([...SETUP_STEP_KEYS]);
    expect(guide.steps.map((s) => s.key)).toEqual(["CONNECT", "IMPORT_STUDENTS", "REACH_ERP", "PUBLISH_INVOICES", "RECEIPTS", "PAYMENTS", "FEE_OPTIONS", "PARENT_INVOICING"]);
    expect(guide.requiredTotal).toBe(4);
    expect(guide.steps.filter((s) => !s.optional).map((s) => s.key)).toEqual(["CONNECT", "IMPORT_STUDENTS", "REACH_ERP", "PUBLISH_INVOICES"]);
    expect(guide.steps.map((s) => s.group)).toEqual(["SHOW_INVOICES", "SHOW_INVOICES", "SHOW_INVOICES", "SHOW_INVOICES", "RECEIPTS_AND_PAYMENTS", "RECEIPTS_AND_PAYMENTS", "PARENT_INVOICES", "PARENT_INVOICES"]);
  });

  it("everything set up: 8 of 8, 4 of 4 required, nothing blocked, no next step", () => {
    const guide = buildSetupGuide(ALL_DONE);
    expect(guide).toMatchObject({ doneCount: 8, totalCount: 8, requiredDone: 4, requiredTotal: 4, nextStepKey: null });
    expect(guide.steps.every((s) => s.state === "DONE" && s.blockedBy.length === 0 && s.detail === null)).toBe(true);
  });
});

describe("a fresh install: only the first step can be started", () => {
  const guide = buildSetupGuide(NOTHING);

  it("CONNECT is the one to do; steps that need it are locked and say what to do first", () => {
    expect(stateOf(guide, "CONNECT")).toBe("TODO:NOT_CONNECTED");
    expect(step(guide, "IMPORT_STUDENTS")).toMatchObject({ state: "LOCKED", blockedBy: ["CONNECT"], detail: null });
    expect(step(guide, "REACH_ERP")).toMatchObject({ state: "LOCKED", blockedBy: ["CONNECT"] });
    expect(step(guide, "PUBLISH_INVOICES")).toMatchObject({ state: "LOCKED", blockedBy: ["IMPORT_STUDENTS"] });
    expect(step(guide, "RECEIPTS")).toMatchObject({ state: "LOCKED", blockedBy: ["REACH_ERP"] });
    expect(step(guide, "PAYMENTS")).toMatchObject({ state: "LOCKED", blockedBy: ["REACH_ERP", "PUBLISH_INVOICES"] });
    expect(step(guide, "PARENT_INVOICING")).toMatchObject({ state: "LOCKED", blockedBy: ["CONNECT", "REACH_ERP", "PUBLISH_INVOICES"] });
  });

  it("the step that needs nothing (fee options) is never locked, even before connecting", () => {
    expect(stateOf(guide, "FEE_OPTIONS")).toBe("TODO:NO_CURRENT_TERM");
  });

  it("the next step is Connect, and nothing is counted done", () => {
    expect(guide).toMatchObject({ doneCount: 0, requiredDone: 0, nextStepKey: "CONNECT" });
  });
});

describe("after connecting", () => {
  const guide = guideOf({ connected: true }, NOTHING);

  it("unlocks the steps that only needed the connection", () => {
    expect(stateOf(guide, "CONNECT")).toBe("DONE");
    expect(stateOf(guide, "IMPORT_STUDENTS")).toBe("TODO:NOT_IMPORTED");
    expect(stateOf(guide, "REACH_ERP")).toBe("TODO:NOT_REGISTERED");
  });

  it("still locks what needs more: publishing needs the student import, payments need the address and publishing", () => {
    expect(step(guide, "PUBLISH_INVOICES").blockedBy).toEqual(["IMPORT_STUDENTS"]);
    expect(step(guide, "PAYMENTS").blockedBy).toEqual(["REACH_ERP", "PUBLISH_INVOICES"]);
    expect(step(guide, "PARENT_INVOICING").blockedBy).toEqual(["REACH_ERP", "PUBLISH_INVOICES"]); // Connect is now met
  });

  it("the next step is the student import", () => {
    expect(guide.nextStepKey).toBe("IMPORT_STUDENTS");
    expect(guide).toMatchObject({ doneCount: 1, requiredDone: 1 });
  });
});

describe("each step's own states", () => {
  it("IMPORT_STUDENTS: not imported -> to do; imported with nothing linked -> needs attention; imported -> done", () => {
    expect(stateOf(guideOf({ firstImportConfirmed: false }), "IMPORT_STUDENTS")).toBe("TODO:NOT_IMPORTED");
    expect(stateOf(guideOf({ firstImportConfirmed: true, mappedStudents: 0 }), "IMPORT_STUDENTS")).toBe("ATTENTION:NO_STUDENTS_LINKED");
    expect(stateOf(guideOf({ firstImportConfirmed: true, mappedStudents: 1 }), "IMPORT_STUDENTS")).toBe("DONE");
  });

  it("REACH_ERP: not registered -> to do; registered but the test failed or was never run -> needs attention; tested ok -> done", () => {
    expect(stateOf(guideOf({ link: { registered: false, lastVerifyOk: null } }), "REACH_ERP")).toBe("TODO:NOT_REGISTERED");
    expect(stateOf(guideOf({ link: { registered: true, lastVerifyOk: false } }), "REACH_ERP")).toBe("ATTENTION:TEST_FAILED");
    expect(stateOf(guideOf({ link: { registered: true, lastVerifyOk: null } }), "REACH_ERP")).toBe("ATTENTION:NOT_TESTED");
    expect(stateOf(guideOf({ link: { registered: true, lastVerifyOk: true } }), "REACH_ERP")).toBe("DONE");
  });

  it("PUBLISH_INVOICES: off -> to do; on but the last publish failed or invoices were refused -> needs attention; on and clean -> done", () => {
    expect(stateOf(guideOf({ publish: { enabled: false, lastPublishOk: null, rejected: 0 } }), "PUBLISH_INVOICES")).toBe("TODO:NOT_ON");
    expect(stateOf(guideOf({ publish: { enabled: true, lastPublishOk: false, rejected: 0 } }), "PUBLISH_INVOICES")).toBe("ATTENTION:PUBLISH_FAILED");
    expect(stateOf(guideOf({ publish: { enabled: true, lastPublishOk: true, rejected: 3 } }), "PUBLISH_INVOICES")).toBe("ATTENTION:SOME_REFUSED");
    expect(stateOf(guideOf({ publish: { enabled: true, lastPublishOk: null, rejected: 0 } }), "PUBLISH_INVOICES")).toBe("DONE"); // on, nothing sent yet: not a problem
  });

  it("RECEIPTS: no logo and no letterhead -> to do; at least one but not complete -> needs attention naming the first thing missing; complete -> done", () => {
    expect(stateOf(guideOf({ receipts: { canIssue: false, complete: false, issues: ["NO_LOGO", "NO_LETTERHEAD", "QR_ADDRESS_NOT_PUBLIC"] } }), "RECEIPTS")).toBe("TODO:NO_BRANDING");
    expect(stateOf(guideOf({ receipts: { canIssue: true, complete: false, issues: ["QR_ADDRESS_NOT_PUBLIC"] } }), "RECEIPTS")).toBe("ATTENTION:QR_ADDRESS_NOT_PUBLIC");
    expect(stateOf(guideOf({ receipts: { canIssue: true, complete: false, issues: ["QR_ADDRESS_NOT_PUBLIC", "NO_LOGO"] } }), "RECEIPTS")).toBe("ATTENTION:NO_LOGO"); // fixed order, not list order
    expect(stateOf(guideOf({ receipts: { canIssue: true, complete: false, issues: ["NO_LETTERHEAD"] } }), "RECEIPTS")).toBe("ATTENTION:NO_LETTERHEAD");
    expect(stateOf(guideOf({ receipts: { canIssue: true, complete: true, issues: [] } }), "RECEIPTS")).toBe("DONE");
  });

  it("RECEIPTS: if the receipt setup cannot be checked the step says so (it does not pretend)", () => {
    expect(stateOf(guideOf({ receipts: null }), "RECEIPTS")).toBe("ATTENTION:CANNOT_CHECK");
  });

  it("PAYMENTS: needs BOTH a real M-Pesa provider and a cashier, and says which is missing", () => {
    expect(stateOf(guideOf({ payments: { providerConfigured: false, cashierConfigured: false } }), "PAYMENTS")).toBe("TODO:NOTHING_SET");
    expect(stateOf(guideOf({ payments: { providerConfigured: false, cashierConfigured: true } }), "PAYMENTS")).toBe("TODO:NO_PROVIDER");
    expect(stateOf(guideOf({ payments: { providerConfigured: true, cashierConfigured: false } }), "PAYMENTS")).toBe("TODO:NO_CASHIER");
    expect(stateOf(guideOf({ payments: { providerConfigured: true, cashierConfigured: true } }), "PAYMENTS")).toBe("DONE");
  });

  it("FEE_OPTIONS: needs an open term; then something for a parent to choose (an optional fee item OR an active transport route)", () => {
    expect(stateOf(guideOf({ feeOptions: { hasCurrentTerm: false, optionalItemLines: 5, activeRoutes: 5 } }), "FEE_OPTIONS")).toBe("TODO:NO_CURRENT_TERM");
    expect(stateOf(guideOf({ feeOptions: { hasCurrentTerm: true, optionalItemLines: 0, activeRoutes: 0 } }), "FEE_OPTIONS")).toBe("TODO:NO_OPTIONAL_ITEMS");
    expect(stateOf(guideOf({ feeOptions: { hasCurrentTerm: true, optionalItemLines: 1, activeRoutes: 0 } }), "FEE_OPTIONS")).toBe("DONE");
    expect(stateOf(guideOf({ feeOptions: { hasCurrentTerm: true, optionalItemLines: 0, activeRoutes: 1 } }), "FEE_OPTIONS")).toBe("DONE");
  });

  it("PARENT_INVOICING: off -> to do (noting a missing invoice user); on without an invoice user -> needs attention; on with one -> done", () => {
    expect(stateOf(guideOf({ parentInvoicing: { enabled: false, invoiceUserConfigured: false } }), "PARENT_INVOICING")).toBe("TODO:NOT_ON_NO_INVOICE_USER");
    expect(stateOf(guideOf({ parentInvoicing: { enabled: false, invoiceUserConfigured: true } }), "PARENT_INVOICING")).toBe("TODO:NOT_ON");
    expect(stateOf(guideOf({ parentInvoicing: { enabled: true, invoiceUserConfigured: false } }), "PARENT_INVOICING")).toBe("ATTENTION:NO_INVOICE_USER");
    expect(stateOf(guideOf({ parentInvoicing: { enabled: true, invoiceUserConfigured: true } }), "PARENT_INVOICING")).toBe("DONE");
  });
});

describe("locking", () => {
  it("a step that is already done is shown DONE even when something it needs is not (the facts are what they are)", () => {
    const guide = guideOf({ firstImportConfirmed: false }); // publishing is on, but the import was never confirmed
    expect(stateOf(guide, "IMPORT_STUDENTS")).toBe("TODO:NOT_IMPORTED");
    expect(stateOf(guide, "PUBLISH_INVOICES")).toBe("DONE");
    expect(step(guide, "PUBLISH_INVOICES").blockedBy).toEqual([]);
  });

  it("a step needing something that is only ATTENTION (not done) is locked behind it", () => {
    const guide = guideOf({ link: { registered: true, lastVerifyOk: false } }); // the test failed
    expect(stateOf(guide, "REACH_ERP")).toBe("ATTENTION:TEST_FAILED");
    // the address test failing does not undo what is already done...
    expect(stateOf(guide, "PAYMENTS")).toBe("DONE");
    // ...but a step that is still to do cannot start behind it
    const guide2 = guideOf({ link: { registered: true, lastVerifyOk: false }, payments: { providerConfigured: false, cashierConfigured: false } });
    expect(step(guide2, "PAYMENTS")).toMatchObject({ state: "LOCKED", blockedBy: ["REACH_ERP"], detail: null });
  });

  it("only the steps that are NOT done are listed as blocking", () => {
    const guide = guideOf({ publish: { enabled: false, lastPublishOk: null, rejected: 0 }, parentInvoicing: { enabled: false, invoiceUserConfigured: false } });
    expect(step(guide, "PARENT_INVOICING").blockedBy).toEqual(["PUBLISH_INVOICES"]); // Connect and the address are done
  });
});

describe("the next step", () => {
  it("is the first step to do or fix in order, never a locked one", () => {
    for (const [over, expected] of [
      [{ connected: true, firstImportConfirmed: false }, "IMPORT_STUDENTS"],
      [{ link: { registered: false, lastVerifyOk: null } }, "REACH_ERP"],
      [{ publish: { enabled: false, lastPublishOk: null, rejected: 0 } }, "PUBLISH_INVOICES"],
      [{ receipts: { canIssue: false, complete: false, issues: [] } }, "RECEIPTS"],
      [{ parentInvoicing: { enabled: false, invoiceUserConfigured: false } }, "PARENT_INVOICING"],
    ] as const) {
      const guide = guideOf(over as Partial<SetupFacts>);
      expect(guide.nextStepKey).toBe(expected);
      expect(guide.steps.find((s) => s.key === guide.nextStepKey)!.state).not.toBe("LOCKED");
    }
  });

  it("a step that needs attention counts as next, just like one not started", () => {
    expect(guideOf({ publish: { enabled: true, lastPublishOk: false, rejected: 0 } }).nextStepKey).toBe("PUBLISH_INVOICES");
  });

  it("the required steps always come before the optional ones", () => {
    const guide = guideOf({ receipts: { canIssue: false, complete: false, issues: [] }, link: { registered: false, lastVerifyOk: null } });
    expect(guide.nextStepKey).toBe("REACH_ERP"); // required, even though RECEIPTS (optional) is also to do
  });

  it("with only optional steps left, the next one is the first of those", () => {
    const guide = guideOf({ feeOptions: { hasCurrentTerm: false, optionalItemLines: 0, activeRoutes: 0 }, payments: { providerConfigured: false, cashierConfigured: false } });
    expect(guide.requiredDone).toBe(guide.requiredTotal);
    expect(guide.nextStepKey).toBe("PAYMENTS");
  });
});

describe("the counts", () => {
  it("count only DONE steps, and the required ones separately", () => {
    const guide = guideOf({ connected: true, firstImportConfirmed: true, mappedStudents: 1 }, NOTHING);
    // CONNECT and IMPORT_STUDENTS done; FEE_OPTIONS (no prerequisite) is not
    expect(guide).toMatchObject({ doneCount: 2, requiredDone: 2, totalCount: 8, requiredTotal: 4 });
  });

  it("an optional step done does not count as a required one", () => {
    const guide = guideOf({ feeOptions: { hasCurrentTerm: true, optionalItemLines: 1, activeRoutes: 0 } }, NOTHING);
    expect(guide).toMatchObject({ doneCount: 1, requiredDone: 0 });
  });
});
