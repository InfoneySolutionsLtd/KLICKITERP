import type { NotificationParams } from "../../../shared/notifications/notification-sink.port";

/**
 * Everything the bell can tell someone, in one place. Settings (the school's on/off and receiving roles), per-user
 * preferences, recipient selection, the English fallback text and the translations' drift test all read THIS list, so an
 * event that is added here is automatically switchable, filterable and covered by the tests.
 *
 * Adding an event: add it to `NOTIFICATION_EVENTS`, add `notifications.types.<CODE>.{title,body}` to the web app's en/fr/sw
 * messages (a server test fails until all three exist), then raise it from the business code with
 * `NotificationSink.emit({ code, params, ... })`.
 */

/** Categories a person can switch off in their own preferences. `essential` ones cannot be switched off by the person. */
export const NOTIFICATION_CATEGORIES = [
  { code: "APPROVALS", essential: true },
  { code: "MONEY", essential: false },
  { code: "SYSTEM", essential: false },
  { code: "OPERATIONS", essential: false },
  { code: "SECURITY", essential: true },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["code"];

export type NotificationAudience =
  /** Only the people the raising code names (approvers, the initiator, the user a security alert is about...). */
  | { kind: "explicit" }
  /** Active staff who hold at least one of these permissions, unless the school picked receiving roles for the event. */
  | { kind: "permissions"; permissions: readonly string[] };

export interface NotificationEventDef {
  /** Stored as `ntf_notification.type` (max 60 characters). */
  code: string;
  category: NotificationCategory;
  audience: NotificationAudience;
  /** True when the receiving people are chosen somewhere else (so the settings card does not offer a roles picker). */
  audienceManagedElsewhere?: boolean;
  /** English text stored with the notification; the web app shows the translated text for the code and falls back to this. */
  fallbackTitle: string;
  fallbackBody: (params: NotificationParams) => string;
}

const text = (params: NotificationParams, key: string, otherwise = "—"): string => {
  const value = params[key];
  return value === null || value === undefined || value === "" ? otherwise : String(value);
};

const approvalName = (params: NotificationParams): string => text(params, "domainName", text(params, "domainCode", "approval"));

export const NOTIFICATION_EVENTS = [
  // ---- Approvals ----------------------------------------------------------------------------------------------------
  {
    code: "APPROVAL_PENDING",
    category: "APPROVALS",
    audience: { kind: "explicit" },
    fallbackTitle: "New approval request",
    fallbackBody: (p) => `Waiting for your decision: ${approvalName(p)}.`,
  },
  {
    code: "APPROVAL_APPROVED",
    category: "APPROVALS",
    audience: { kind: "explicit" },
    fallbackTitle: "Your request was approved",
    fallbackBody: (p) => `Your ${approvalName(p)} request was approved.`,
  },
  {
    code: "APPROVAL_REJECTED",
    category: "APPROVALS",
    audience: { kind: "explicit" },
    fallbackTitle: "Your request was rejected",
    fallbackBody: (p) => `Your ${approvalName(p)} request was rejected.`,
  },
  {
    code: "APPROVAL_RETURNED",
    category: "APPROVALS",
    audience: { kind: "explicit" },
    fallbackTitle: "Your request was returned",
    fallbackBody: (p) => `Your ${approvalName(p)} request was returned for changes.`,
  },
  // ---- Money and accounts -------------------------------------------------------------------------------------------
  {
    code: "CHEQUE_BOUNCED",
    category: "MONEY",
    audience: { kind: "permissions", permissions: ["payments:cheque:manage"] },
    fallbackTitle: "Cheque bounced",
    fallbackBody: (p) => `Cheque ${text(p, "chequeNo")} for KES ${text(p, "amount")} was returned unpaid${p.payer ? ` (${text(p, "payer")})` : ""}.`,
  },
  {
    code: "PAYMENT_NEEDS_MATCHING",
    category: "MONEY",
    audience: { kind: "permissions", permissions: ["payments:suspense:manage"] },
    fallbackTitle: "Payment needs matching",
    fallbackBody: (p) => `A payment of KES ${text(p, "amount")} (reference ${text(p, "reference")}) could not be matched automatically and is waiting in suspense.`,
  },
  {
    code: "PARENT_INVOICE_CREATED",
    category: "MONEY",
    audience: { kind: "explicit" },
    audienceManagedElsewhere: true,
    fallbackTitle: "Invoice created by a parent",
    fallbackBody: (p) =>
      `${text(p, "parentName", "A parent")} has created ${Number(p.count) > 1 ? "invoices" : "an invoice"} ${text(p, "numbers")} for ${text(p, "learner")} (${text(p, "admissionNo")}), ${text(p, "term")}: KES ${text(p, "total")}.`,
  },
  {
    code: "ONLINE_PAYMENT_RECEIVED",
    category: "MONEY",
    audience: { kind: "permissions", permissions: ["payments:receipt:view"] },
    fallbackTitle: "Online payment received",
    fallbackBody: (p) => `${text(p, "payer", "Someone")} paid KES ${text(p, "amount")} for ${text(p, "learner")} (receipt ${text(p, "receiptNo")}).`,
  },
  {
    code: "PAYROLL_RUN_PAID",
    category: "MONEY",
    audience: { kind: "permissions", permissions: ["payroll:run:view"] },
    fallbackTitle: "Payroll run paid",
    fallbackBody: (p) => `The ${text(p, "period")} payroll run has been paid.`,
  },
  // ---- System health ------------------------------------------------------------------------------------------------
  {
    code: "BACKUP_FAILED",
    category: "SYSTEM",
    audience: { kind: "permissions", permissions: ["backups:run:view"] },
    fallbackTitle: "Backup failed",
    fallbackBody: (p) => `A ${text(p, "kind", "scheduled").toLowerCase()} backup did not complete${p.reason ? `: ${text(p, "reason")}` : "."}`,
  },
  {
    code: "RESTORE_CHECK_FAILED",
    category: "SYSTEM",
    audience: { kind: "permissions", permissions: ["backups:restore:verify"] },
    fallbackTitle: "Backup restore check failed",
    fallbackBody: (p) => `A backup could not be restored in the verification test${p.reason ? `: ${text(p, "reason")}` : "."}`,
  },
  {
    code: "LICENCE_STATE_CHANGED",
    category: "SYSTEM",
    audience: { kind: "permissions", permissions: ["license:status:view"] },
    fallbackTitle: "Licence status changed",
    fallbackBody: (p) => `The licence changed from ${text(p, "from")} to ${text(p, "to")}${p.validTo ? ` (valid until ${text(p, "validTo")})` : ""}.`,
  },
  {
    code: "UPDATE_AVAILABLE",
    category: "SYSTEM",
    audience: { kind: "permissions", permissions: ["license:status:view"] },
    fallbackTitle: "Update available",
    fallbackBody: (p) => `Version ${text(p, "version")} is available${p.urgency ? ` (${text(p, "urgency")})` : ""}.`,
  },
  {
    code: "ACADEMY_PUBLISH_FAILING",
    category: "SYSTEM",
    audience: { kind: "permissions", permissions: ["academy:sync:manage"] },
    fallbackTitle: "Publishing invoices to the Academy is failing",
    fallbackBody: (p) => `Invoices are not reaching the parent portal${p.reason ? `: ${text(p, "reason")}` : "."}`,
  },
  {
    code: "ACADEMY_SYNC_FAILING",
    category: "SYSTEM",
    audience: { kind: "permissions", permissions: ["academy:sync:manage"] },
    fallbackTitle: "Syncing with the Academy is failing",
    fallbackBody: (p) => `The last sync with the Klickit Academy did not complete${p.reason ? `: ${text(p, "reason")}` : "."}`,
  },
  // ---- Stock and operations -----------------------------------------------------------------------------------------
  {
    code: "LOW_STOCK",
    category: "OPERATIONS",
    audience: { kind: "permissions", permissions: ["inventory:item:manage"] },
    fallbackTitle: "Low stock",
    fallbackBody: (p) => `${text(p, "item")} is down to ${text(p, "onHand")} (reorder level ${text(p, "reorderLevel")})${p.store ? ` in ${text(p, "store")}` : ""}.`,
  },
  {
    code: "BULK_BILLING_DONE",
    category: "OPERATIONS",
    audience: { kind: "explicit" },
    fallbackTitle: "Bulk billing finished",
    fallbackBody: (p) => `Bulk billing for ${text(p, "term")} finished: ${text(p, "created", "0")} created, ${text(p, "skipped", "0")} skipped, ${text(p, "failed", "0")} failed.`,
  },
  // ---- Security -----------------------------------------------------------------------------------------------------
  {
    code: "ACCOUNT_LOCKED",
    category: "SECURITY",
    audience: { kind: "permissions", permissions: ["users:user:suspend"] },
    fallbackTitle: "Account locked",
    fallbackBody: (p) => `The account ${text(p, "username")} was locked after too many failed sign-in attempts.`,
  },
  {
    code: "SESSION_REUSE_DETECTED",
    category: "SECURITY",
    audience: { kind: "explicit" },
    fallbackTitle: "Your sessions were signed out",
    fallbackBody: () => "A sign-in token of yours was used twice, which can mean it was copied. For safety, every session of yours was signed out. Sign in again and change your password if this was not you.",
  },
] as const satisfies readonly NotificationEventDef[];

export type NotificationEventCode = (typeof NOTIFICATION_EVENTS)[number]["code"];

const EVENTS_BY_CODE: ReadonlyMap<string, NotificationEventDef> = new Map(NOTIFICATION_EVENTS.map((event) => [event.code, event]));

/** `undefined` for a code that is not in the catalogue (still delivered, but not switchable and without a category). */
export function findNotificationEvent(code: string): NotificationEventDef | undefined {
  return EVENTS_BY_CODE.get(code);
}

export function isEssentialCategory(category: string): boolean {
  return NOTIFICATION_CATEGORIES.some((entry) => entry.code === category && entry.essential);
}

export function isNotificationCategory(value: string): value is NotificationCategory {
  return NOTIFICATION_CATEGORIES.some((entry) => entry.code === value);
}
