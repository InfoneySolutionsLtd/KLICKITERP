import { Money } from "../../../shared/money/money";

/** Settings key for the user the ERP records parent-generated invoices under. Falls back to the M-Pesa system cashier. */
export const PARENT_INVOICE_ACTOR_SETTING_KEY = "academy.parent_invoice_actor_user_id";
/** Who is told about a parent-generated invoice when the school has not picked any role. */
export const PARENT_INVOICE_NOTIFY_FALLBACK_PERMISSION = "billing:invoice:post";
export const PARENT_INVOICE_NOTIFICATION_TYPE = "PARENT_INVOICE_CREATED";

/** Why a request is turned down BEFORE anything is created. The wording is for a parent. */
export const PARENT_INVOICE_REFUSALS = {
  FEATURE_OFF: "Creating invoices online is not available for this school. Please contact the school office.",
  NOT_READY: "The school has not finished setting this up. Please contact the school office.",
  STUDENT_NOT_LINKED: "This learner is not set up for online invoices at the school yet. Please contact the school office.",
  TERM_NOT_AVAILABLE: "Invoices can only be generated for the school's current term. Please refresh and try again.",
  NOTHING_TO_ADD: "There is nothing to add for this term. Please choose at least one item.",
  ITEM_NOT_OFFERED: "One of the chosen items is no longer available. Please refresh and choose again.",
  ROUTE_NOT_OFFERED: "That transport route is no longer available. Please refresh and choose again.",
  ALREADY_ISSUED: "The school has just issued this term's invoice. Please refresh to see what you can still add.",
  NOT_CREATED: "We could not create the invoice just now. Nothing was charged. Please try again in a moment.",
} as const;

export type ParentInvoiceRefusalCode = keyof typeof PARENT_INVOICE_REFUSALS;

/** Thrown inside the creation transaction to roll it back and answer with a parent-safe refusal. */
export class ParentInvoiceRefusal extends Error {
  constructor(readonly code: ParentInvoiceRefusalCode) {
    super(PARENT_INVOICE_REFUSALS[code]);
  }
}

/** One fee line of the term's fee structure, as the planner sees it. */
export interface TermLine {
  categoryId: string;
  name: string;
  amount: Money;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  isOptional: boolean;
}

export interface TransportRouteChoice {
  routeId: string;
  name: string;
  amount: Money;
}

/** Everything known about one learner and one term, read from the books. */
export interface TermFacts {
  /** The applicable PUBLISHED structure's lines for this term. */
  lines: TermLine[];
  /** Optional categories the SCHOOL has already opted this learner into for the term. */
  schoolOptedCategoryIds: ReadonlySet<string>;
  /** Fee categories already on a live (not voided) invoice of this learner this term, from ANY source. */
  billedCategoryIds: ReadonlySet<string>;
  /** A live structure-generated invoice already exists for the term (only one can, BR-BILL-04). */
  liveStructureInvoice: boolean;
  /** The learner is already billed for transport this term. */
  transportBilled: boolean;
  /** Active routes. */
  routes: TransportRouteChoice[];
}

export type ParentInvoiceMode = "FULL" | "TOP_UP";

/**
 * What a parent may do for a learner in a term.
 *
 * - `FULL`: the school has billed NOTHING of this term's fee structure for the learner. The parent's invoice is the term's
 *   whole fee invoice: every mandatory line plus the optional lines they pick (and any the school already opted them into).
 * - `TOP_UP`: something of the term is already billed (a structure invoice, or mandatory categories billed another way —
 *   e.g. the school's bulk ad-hoc run). The parent can only ADD optional items that are not billed yet and/or transport; the
 *   mandatory fees are the school's and are never repeated.
 */
export interface TermPlan {
  mode: ParentInvoiceMode;
  /** FULL only: lines the invoice carries whatever the parent chooses (mandatory + already school-opted). Read-only. */
  included: TermLine[];
  /** Optional lines the parent may tick. */
  selectable: TermLine[];
  /** Routes the parent may pick (empty when transport is already billed for the term or no route is active). */
  routes: TransportRouteChoice[];
  transportAlreadyBilled: boolean;
}

/** The plan for a term, or null when there is nothing a parent could do in it. */
export function planTerm(facts: TermFacts): TermPlan | null {
  const mandatory = facts.lines.filter((line) => !line.isOptional);
  const optional = facts.lines.filter((line) => line.isOptional);
  const mandatoryAlreadyBilled = mandatory.some((line) => facts.billedCategoryIds.has(line.categoryId));
  // The structure invoice carries every optional line the school opted the learner into; if one of those is already billed
  // another way, generating it again would bill it twice, so only a top-up is safe.
  const optedInAlreadyBilled = optional.some(
    (line) => facts.schoolOptedCategoryIds.has(line.categoryId) && facts.billedCategoryIds.has(line.categoryId),
  );
  const mode: ParentInvoiceMode =
    !facts.liveStructureInvoice && !mandatoryAlreadyBilled && !optedInAlreadyBilled ? "FULL" : "TOP_UP";

  const unbilledOptional = optional.filter((line) => !facts.billedCategoryIds.has(line.categoryId));
  const included =
    mode === "FULL"
      ? [...mandatory, ...unbilledOptional.filter((line) => facts.schoolOptedCategoryIds.has(line.categoryId))]
      : [];
  const selectable =
    mode === "FULL" ? unbilledOptional.filter((line) => !facts.schoolOptedCategoryIds.has(line.categoryId)) : unbilledOptional;
  const routes = facts.transportBilled ? [] : facts.routes;

  if (included.length === 0 && selectable.length === 0 && routes.length === 0) {
    return null;
  }
  if (mode === "TOP_UP" && selectable.length === 0 && routes.length === 0) {
    return null;
  }
  return { mode, included, selectable, routes, transportAlreadyBilled: facts.transportBilled };
}

export interface ParentInvoiceChoice {
  optionalCategoryIds: string[];
  routeId: string | null;
}

/** The refusal for a choice that does not fit the plan, or null when it is acceptable. */
export function checkChoice(plan: TermPlan, choice: ParentInvoiceChoice): ParentInvoiceRefusalCode | null {
  const offered = new Set(plan.selectable.map((line) => line.categoryId));
  if (choice.optionalCategoryIds.some((id) => !offered.has(id))) {
    return "ITEM_NOT_OFFERED";
  }
  if (choice.routeId !== null && !plan.routes.some((route) => route.routeId === choice.routeId)) {
    return "ROUTE_NOT_OFFERED";
  }
  const somethingChosen = choice.optionalCategoryIds.length > 0 || choice.routeId !== null;
  // A FULL invoice with mandatory lines is worth generating even with no extras; a top-up is only worth it with something added.
  if (!somethingChosen && (plan.mode === "TOP_UP" || plan.included.length === 0)) {
    return "NOTHING_TO_ADD";
  }
  return null;
}

/** The latest of some `YYYY-MM-DD` dates (they sort as text), or null for none. */
export function latestDate(dates: string[]): string | null {
  return dates.length === 0 ? null : dates.reduce((latest, next) => (next > latest ? next : latest));
}

/** Sum of decimal strings, 4 places. */
export function sumDecimalStrings(values: string[]): string {
  return values.reduce((total, next) => total.add(Money.fromDecimalString(next)), Money.ZERO).toDecimalString();
}

/** `2500.0000` -> `2,500`, `2500.5000` -> `2,500.50` — for a sentence, not for arithmetic. */
export function formatKes(amount: string): string {
  const money = Money.fromDecimalString(amount);
  const [whole, fraction = ""] = money.toDecimalString().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = fraction.slice(0, 2);
  return /^0*$/.test(cents) ? grouped : `${grouped}.${cents}`;
}
