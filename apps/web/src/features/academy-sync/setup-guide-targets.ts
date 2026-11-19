/**
 * Where each step of the Academy setup guide is done, and what buttons its row offers. Pure (no React), so it can be reasoned about
 * and tested on its own.
 *
 * A target is either a card on the Licence page (`anchor`: the id of the wrapper around it), another page (`href`), a step to do
 * first (`step`), or the user picker built into the row (`picker`).
 */

export type StepKey =
  | "CONNECT"
  | "IMPORT_STUDENTS"
  | "REACH_ERP"
  | "PUBLISH_INVOICES"
  | "RECEIPTS"
  | "PAYMENTS"
  | "FEE_OPTIONS"
  | "PARENT_INVOICING";

export type StepTarget = { anchor: string } | { href: string } | { step: StepKey } | { picker: "PAYMENTS_CASHIER" };

export interface StepAction {
  /** Message key under `license.setupGuide.actions.*`. */
  labelKey: "openCard" | "openBranding" | "openIntegrations" | "openAcademicCalendar" | "openFeeStructures" | "openTransportRoutes" | "chooseCashier" | "doFirst";
  target: StepTarget;
  /** The step named in a "do <step> first" button. */
  firstStep?: StepKey;
}

/** The ids of the wrappers around the existing cards on the Licence page. */
export const SECTION_IDS: Record<"CONNECT" | "IMPORT_STUDENTS" | "REACH_ERP" | "PUBLISH_INVOICES" | "PARENT_INVOICING", string> = {
  CONNECT: "setup-connect",
  IMPORT_STUDENTS: "setup-import",
  REACH_ERP: "setup-reach",
  PUBLISH_INVOICES: "setup-publish",
  PARENT_INVOICING: "setup-parent-invoicing",
};

interface StepForActions {
  key: StepKey;
  state: string;
  detail: string | null;
  blockedBy: string[];
}

interface PaymentsFacts {
  providerConfigured: boolean;
  cashier: { configured: boolean };
}

/**
 * The buttons a step's row shows.
 *  - LOCKED: one button, "Do <the first step it needs> first".
 *  - DONE: none (the row just says it is done).
 *  - Otherwise: the way to the place where it is done, which depends on what exactly is missing.
 */
export function stepActions(step: StepForActions, payments: PaymentsFacts): StepAction[] {
  if (step.state === "LOCKED") {
    const first = step.blockedBy[0] as StepKey | undefined;
    return first ? [{ labelKey: "doFirst", target: { step: first }, firstStep: first }] : [];
  }
  if (step.state === "DONE") return [];

  const card = (key: keyof typeof SECTION_IDS): StepAction[] => [{ labelKey: "openCard", target: { anchor: SECTION_IDS[key] } }];

  switch (step.key) {
    case "CONNECT":
    case "IMPORT_STUDENTS":
    case "REACH_ERP":
    case "PUBLISH_INVOICES":
    case "PARENT_INVOICING":
      return card(step.key);
    case "RECEIPTS":
      // The QR address is an environment setting with no screen; the publish card is where the receipt setup is explained.
      return step.detail === "QR_ADDRESS_NOT_PUBLIC" ? card("PUBLISH_INVOICES") : [{ labelKey: "openBranding", target: { href: "/branding" } }];
    case "PAYMENTS": {
      const actions: StepAction[] = [];
      if (!payments.providerConfigured) actions.push({ labelKey: "openIntegrations", target: { href: "/settings/integrations" } });
      if (!payments.cashier.configured) actions.push({ labelKey: "chooseCashier", target: { picker: "PAYMENTS_CASHIER" } });
      return actions;
    }
    case "FEE_OPTIONS":
      return step.detail === "NO_CURRENT_TERM"
        ? [{ labelKey: "openAcademicCalendar", target: { href: "/settings/academic-calendar" } }]
        : [
            { labelKey: "openFeeStructures", target: { href: "/billing/fee-structures" } },
            { labelKey: "openTransportRoutes", target: { href: "/billing/transport-routes" } },
          ];
  }
}

/** Scrolls to a card on this page and outlines it for a moment, so the eye finds it. Does nothing when the card is not on the page. */
export function scrollToSection(anchor: string): boolean {
  const element = typeof document === "undefined" ? null : document.getElementById(anchor);
  if (!element) return false;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
  const classes = ["ring-2", "ring-primary", "ring-offset-2", "rounded-xl"];
  element.classList.add(...classes);
  window.setTimeout(() => element.classList.remove(...classes), 2200);
  return true;
}

/** The target a step's own "go" button leads to when it has a single clear place (used by the Next step button). */
export function primaryTarget(step: StepForActions, payments: PaymentsFacts): StepTarget | null {
  const first = stepActions(step, payments)[0];
  return first ? first.target : null;
}

/**
 * Where "Do <step> first" leads. The step named may itself be waiting on another one, so this follows the chain to the first step
 * that can actually be started and returns where THAT is done.
 */
export function targetToDoFirst(first: StepKey, steps: StepForActions[], payments: PaymentsFacts): StepTarget | null {
  let current = steps.find((step) => step.key === first);
  const seen = new Set<StepKey>();
  while (current && current.state === "LOCKED" && !seen.has(current.key)) {
    seen.add(current.key);
    const next = current.blockedBy[0];
    current = steps.find((step) => step.key === next);
  }
  return current ? primaryTarget(current, payments) : null;
}
