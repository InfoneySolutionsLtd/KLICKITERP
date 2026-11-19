/**
 * The guided configuration of the Klickit Academy link: which steps there are, in what order, which need which, and whether
 * each is done. Pure rules (no I/O) so every case is easy to test; `AcademySetupGuideService` gathers the facts.
 *
 * Nothing here is stored: the guide is worked out from the real state every time, so it can never disagree with it.
 */

export const SETUP_STEP_KEYS = [
  "CONNECT",
  "IMPORT_STUDENTS",
  "REACH_ERP",
  "PUBLISH_INVOICES",
  "RECEIPTS",
  "PAYMENTS",
  "FEE_OPTIONS",
  "PARENT_INVOICING",
] as const;

export type SetupStepKey = (typeof SETUP_STEP_KEYS)[number];

export type SetupGroup = "SHOW_INVOICES" | "RECEIPTS_AND_PAYMENTS" | "PARENT_INVOICES";

/**
 * `DONE`; `TODO` = not started; `ATTENTION` = started but something is wrong (a failed test, a refused invoice...);
 * `LOCKED` = cannot start yet because a step it needs is not done (`blockedBy` names them).
 */
export type SetupStepState = "DONE" | "TODO" | "ATTENTION" | "LOCKED";

export interface SetupStep {
  key: SetupStepKey;
  group: SetupGroup;
  /** Optional steps are shown but never needed to show invoices to parents. */
  optional: boolean;
  state: SetupStepState;
  /** The steps that must be done first and are not (empty unless LOCKED). */
  blockedBy: SetupStepKey[];
  /** A short machine code saying why the step is in this state; the web app turns it into words. */
  detail: string | null;
}

/** What the guide is worked out from. Everything is a plain fact, gathered by the service. */
export interface SetupFacts {
  connected: boolean;
  firstImportConfirmed: boolean;
  mappedStudents: number;
  link: { registered: boolean; lastVerifyOk: boolean | null };
  publish: { enabled: boolean; lastPublishOk: boolean | null; rejected: number };
  /** Null when the receipt setup could not be checked. */
  receipts: { canIssue: boolean; complete: boolean; issues: string[] } | null;
  payments: { providerConfigured: boolean; cashierConfigured: boolean };
  feeOptions: { hasOpenTerm: boolean; optionalItemLines: number; activeRoutes: number };
  parentInvoicing: { enabled: boolean; invoiceUserConfigured: boolean };
}

export interface SetupGuide {
  steps: SetupStep[];
  doneCount: number;
  totalCount: number;
  requiredDone: number;
  requiredTotal: number;
  /** The first step to do or fix (never a locked one); null when everything is done. */
  nextStepKey: SetupStepKey | null;
}

interface StepDefinition {
  group: SetupGroup;
  optional: boolean;
  /** Steps that must be DONE before this one can be started. */
  needs: SetupStepKey[];
  /** The step's own state, ignoring what it needs. */
  own: (facts: SetupFacts) => { state: Exclude<SetupStepState, "LOCKED">; detail: string | null };
}

const RECEIPT_ISSUE_ORDER = ["NO_LOGO", "NO_LETTERHEAD", "QR_ADDRESS_NOT_PUBLIC"];

/** The steps, in the order a person should do them. */
const DEFINITIONS: Record<SetupStepKey, StepDefinition> = {
  CONNECT: {
    group: "SHOW_INVOICES",
    optional: false,
    needs: [],
    own: (f) => (f.connected ? { state: "DONE", detail: null } : { state: "TODO", detail: "NOT_CONNECTED" }),
  },
  IMPORT_STUDENTS: {
    group: "SHOW_INVOICES",
    optional: false,
    needs: ["CONNECT"],
    own: (f) => {
      if (!f.firstImportConfirmed) return { state: "TODO", detail: "NOT_IMPORTED" };
      // Confirmed, but nothing is linked: the school is empty on one side or the other, so say so rather than call it done.
      return f.mappedStudents > 0 ? { state: "DONE", detail: null } : { state: "ATTENTION", detail: "NO_STUDENTS_LINKED" };
    },
  },
  REACH_ERP: {
    group: "SHOW_INVOICES",
    optional: false,
    needs: ["CONNECT"],
    own: (f) => {
      if (!f.link.registered) return { state: "TODO", detail: "NOT_REGISTERED" };
      if (f.link.lastVerifyOk === true) return { state: "DONE", detail: null };
      return { state: "ATTENTION", detail: f.link.lastVerifyOk === false ? "TEST_FAILED" : "NOT_TESTED" };
    },
  },
  PUBLISH_INVOICES: {
    group: "SHOW_INVOICES",
    optional: false,
    needs: ["IMPORT_STUDENTS"],
    own: (f) => {
      if (!f.publish.enabled) return { state: "TODO", detail: "NOT_ON" };
      if (f.publish.lastPublishOk === false) return { state: "ATTENTION", detail: "PUBLISH_FAILED" };
      if (f.publish.rejected > 0) return { state: "ATTENTION", detail: "SOME_REFUSED" };
      return { state: "DONE", detail: null };
    },
  },
  RECEIPTS: {
    group: "RECEIPTS_AND_PAYMENTS",
    optional: true,
    needs: ["REACH_ERP"],
    own: (f) => {
      if (!f.receipts) return { state: "ATTENTION", detail: "CANNOT_CHECK" };
      if (f.receipts.complete) return { state: "DONE", detail: null };
      // Neither a logo nor letterhead: receipts cannot be issued at all. With at least one, they can; the rest is polish.
      if (!f.receipts.canIssue) return { state: "TODO", detail: "NO_BRANDING" };
      const first = RECEIPT_ISSUE_ORDER.find((issue) => f.receipts?.issues.includes(issue));
      return { state: "ATTENTION", detail: first ?? "INCOMPLETE" };
    },
  },
  PAYMENTS: {
    group: "RECEIPTS_AND_PAYMENTS",
    optional: true,
    needs: ["REACH_ERP", "PUBLISH_INVOICES"],
    own: (f) => {
      const { providerConfigured, cashierConfigured } = f.payments;
      if (providerConfigured && cashierConfigured) return { state: "DONE", detail: null };
      if (!providerConfigured && !cashierConfigured) return { state: "TODO", detail: "NOTHING_SET" };
      return { state: "TODO", detail: providerConfigured ? "NO_CASHIER" : "NO_PROVIDER" };
    },
  },
  FEE_OPTIONS: {
    group: "PARENT_INVOICES",
    optional: true,
    needs: [],
    own: (f) => {
      if (!f.feeOptions.hasOpenTerm) return { state: "TODO", detail: "NO_OPEN_TERM" };
      // Something for a parent to choose: an optional fee item on the published structure, or an active transport route.
      return f.feeOptions.optionalItemLines > 0 || f.feeOptions.activeRoutes > 0
        ? { state: "DONE", detail: null }
        : { state: "TODO", detail: "NO_OPTIONAL_ITEMS" };
    },
  },
  PARENT_INVOICING: {
    group: "PARENT_INVOICES",
    optional: true,
    needs: ["CONNECT", "REACH_ERP", "PUBLISH_INVOICES"],
    own: (f) => {
      const { enabled, invoiceUserConfigured } = f.parentInvoicing;
      if (enabled && invoiceUserConfigured) return { state: "DONE", detail: null };
      // On but unable to create anything: parents are being told the school has not finished setting it up.
      if (enabled) return { state: "ATTENTION", detail: "NO_INVOICE_USER" };
      return { state: "TODO", detail: invoiceUserConfigured ? "NOT_ON" : "NOT_ON_NO_INVOICE_USER" };
    },
  },
};

export function buildSetupGuide(facts: SetupFacts): SetupGuide {
  const own = new Map<SetupStepKey, ReturnType<StepDefinition["own"]>>(SETUP_STEP_KEYS.map((key) => [key, DEFINITIONS[key].own(facts)]));
  const isDone = (key: SetupStepKey) => own.get(key)?.state === "DONE";

  const steps: SetupStep[] = SETUP_STEP_KEYS.map((key) => {
    const definition = DEFINITIONS[key];
    const state = own.get(key) as ReturnType<StepDefinition["own"]>;
    // A step whose own condition is already met stays DONE even if something it "needs" is not (the facts are what they are).
    const blockedBy = state.state === "DONE" ? [] : definition.needs.filter((needed) => !isDone(needed));
    return {
      key,
      group: definition.group,
      optional: definition.optional,
      state: blockedBy.length > 0 ? "LOCKED" : state.state,
      blockedBy,
      detail: blockedBy.length > 0 ? null : state.detail,
    };
  });

  const required = steps.filter((step) => !step.optional);
  return {
    steps,
    doneCount: steps.filter((step) => step.state === "DONE").length,
    totalCount: steps.length,
    requiredDone: required.filter((step) => step.state === "DONE").length,
    requiredTotal: required.length,
    nextStepKey: steps.find((step) => step.state === "TODO" || step.state === "ATTENTION")?.key ?? null,
  };
}
