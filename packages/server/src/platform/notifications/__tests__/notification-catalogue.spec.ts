import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERMISSION_CATALOGUE } from "../../users";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_EVENTS,
  findNotificationEvent,
  isEssentialCategory,
  isNotificationCategory,
} from "../domain/notification-catalogue";

describe("the notification catalogue", () => {
  it("has unique event codes that fit the column (60 characters) and use plain upper-case words", () => {
    const codes = NOTIFICATION_EVENTS.map((event) => event.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code.length).toBeLessThanOrEqual(60);
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it("puts every event in a known category", () => {
    for (const event of NOTIFICATION_EVENTS) expect(isNotificationCategory(event.category)).toBe(true);
  });

  it("makes approvals and security essential, and nothing else", () => {
    expect(NOTIFICATION_CATEGORIES.filter((category) => category.essential).map((category) => category.code)).toEqual(["APPROVALS", "SECURITY"]);
    expect(isEssentialCategory("SECURITY")).toBe(true);
    expect(isEssentialCategory("MONEY")).toBe(false);
    expect(isEssentialCategory("NOT_A_CATEGORY")).toBe(false);
  });

  it("only names permissions that exist in the permission catalogue (a typo would silently notify nobody)", () => {
    const known = new Set(PERMISSION_CATALOGUE.map((entry) => entry.code));
    for (const event of NOTIFICATION_EVENTS) {
      if (event.audience.kind !== "permissions") continue;
      expect(event.audience.permissions.length).toBeGreaterThan(0);
      for (const permission of event.audience.permissions) {
        expect([event.code, permission, known.has(permission)]).toEqual([event.code, permission, true]);
      }
    }
  });

  it("finds an event by code, and says nothing for an unknown one", () => {
    expect(findNotificationEvent("CHEQUE_BOUNCED")?.category).toBe("MONEY");
    expect(findNotificationEvent("NOPE")).toBeUndefined();
  });

  it("builds an English fallback sentence from realistic params for every event, with no 'undefined' or 'null' in it", () => {
    const params = {
      domainName: "Petty Cash Replenishment", chequeNo: "000123", amount: "5,000", payer: "Mr Otieno", reference: "ABC123", parentName: "Grace Otieno",
      learner: "Amina Otieno", admissionNo: "ADM-1001", term: "Term 1 2026", numbers: "INV-000201", total: "21,500", count: 1, receiptNo: "R-1", period: "2026-11",
      kind: "SCHEDULED", reason: "disk full", from: "ACTIVE", to: "GRACE", validTo: "2026-12-31", version: "1.4.0", urgency: "mandatory", item: "Exercise books",
      onHand: "3", reorderLevel: "10", store: "Main store", created: 10, skipped: 1, failed: 0, username: "jane",
    };
    for (const event of NOTIFICATION_EVENTS) {
      expect(event.fallbackTitle.trim().length).toBeGreaterThan(0);
      expect(event.fallbackTitle.length).toBeLessThanOrEqual(200);
      const body = event.fallbackBody(params);
      expect([event.code, body.trim().length > 0, /undefined|null|\[object/.test(body)]).toEqual([event.code, true, false]);
    }
  });

  it("still reads sensibly when the optional params are missing", () => {
    for (const event of NOTIFICATION_EVENTS) {
      const body = event.fallbackBody({});
      expect([event.code, /undefined|null|\[object/.test(body)]).toEqual([event.code, false]);
    }
  });

  it("keeps the exact wording the parent-invoice notification always had", () => {
    const event = findNotificationEvent("PARENT_INVOICE_CREATED");
    expect(event?.fallbackTitle).toBe("Invoice created by a parent");
    expect(event?.fallbackBody({ parentName: "Grace Otieno", count: 2, numbers: "INV-000201, INV-000202", learner: "Amina Otieno", admissionNo: "ADM-1001", term: "Term 1 2026", total: "26,500" })).toBe(
      "Grace Otieno has created invoices INV-000201, INV-000202 for Amina Otieno (ADM-1001), Term 1 2026: KES 26,500.",
    );
    expect(event?.fallbackBody({ parentName: null, count: 1, numbers: "INV-000201", learner: "A", admissionNo: "B", term: "T", total: "1" })).toMatch(/^A parent has created an invoice INV-000201/);
  });
});

/**
 * The web app renders each notification from `notifications.types.<CODE>` in the reader's language and cannot ask at
 * runtime whether a key exists, so these files are checked against the catalogue here: an event added to the catalogue
 * without its three translations (or a translation left behind for a removed event) fails this test.
 */
describe("the catalogue and the web app's translations agree", () => {
  const messagesDir = resolve(__dirname, "../../../../../../apps/web/src/i18n/messages");
  const locales = ["en", "fr", "sw"] as const;
  interface NotificationMessages {
    types: Record<string, { title: string; body: string }>;
    categories: Record<string, { name: string; description: string }>;
  }
  const load = (locale: string): NotificationMessages => JSON.parse(readFileSync(resolve(messagesDir, `${locale}.json`), "utf8")).notifications;
  /** The argument names an ICU message uses at its top level: `{name}` and `{name, plural, ...}` (the words inside a plural's branches are not arguments). */
  const argsOf = (message: string): string[] => {
    const names = new Set<string>();
    let depth = 0;
    for (let index = 0; index < message.length; index += 1) {
      const char = message[index];
      if (char === "{") {
        if (depth === 0) {
          const name = /^\s*(\w+)\s*[,}]/.exec(message.slice(index + 1))?.[1];
          if (name) names.add(name);
        }
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
    }
    return [...names].sort();
  };

  it.each(locales)("%s has a title and a body for every event, and for nothing else", (locale) => {
    const types = load(locale).types as Record<string, { title: string; body: string }>;
    expect(Object.keys(types).sort()).toEqual(NOTIFICATION_EVENTS.map((event) => event.code).sort());
    for (const [code, text] of Object.entries(types)) {
      expect([code, typeof text.title === "string" && text.title.trim().length > 0]).toEqual([code, true]);
      expect([code, typeof text.body === "string" && text.body.trim().length > 0]).toEqual([code, true]);
    }
  });

  it.each(locales)("%s names and describes every category, and no other", (locale) => {
    const categories = load(locale).categories as Record<string, { name: string; description: string }>;
    expect(Object.keys(categories).sort()).toEqual(NOTIFICATION_CATEGORIES.map((category) => category.code).sort());
    for (const [code, text] of Object.entries(categories)) {
      expect([code, text.name.trim().length > 0, text.description.trim().length > 0]).toEqual([code, true, true]);
    }
  });

  it("fr and sw use exactly the same placeholders as en in every title and body (a missing one would show a blank)", () => {
    const en = load("en").types as Record<string, { title: string; body: string }>;
    for (const locale of ["fr", "sw"] as const) {
      const other = load(locale).types as Record<string, { title: string; body: string }>;
      for (const code of Object.keys(en)) {
        expect([locale, code, argsOf(other[code].title), argsOf(other[code].body)]).toEqual([locale, code, argsOf(en[code].title), argsOf(en[code].body)]);
      }
    }
  });
});
