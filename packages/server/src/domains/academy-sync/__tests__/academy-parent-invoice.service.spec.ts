/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { Money } from "../../../shared/money/money";
import { AcademyParentInvoiceService } from "../application/academy-parent-invoice.service";
import type { ParentInvoiceRequestRow } from "../infrastructure/acad-parent-invoice-request.repository";

// The transaction helper only needs to hand the callback an entity manager (which records the advisory-lock query).
const EM = { query: jest.fn(async () => []) };
jest.mock("../../../shared/database/tx", () => ({ runInTransaction: async (_ds: unknown, fn: (em: unknown) => unknown) => fn(EM) }));

const REQ = "11111111-1111-4111-8111-111111111111";
const ACADEMY_STUDENT = "ac-student-1";
const TERM = "t0000000-0000-4000-8000-000000000001";
const PAST_TERM = "t0000000-0000-4000-8000-000000000009";
const TUITION = "c0000000-0000-4000-8000-000000000001";
const MILK = "c0000000-0000-4000-8000-000000000003";
const LUNCH = "c0000000-0000-4000-8000-000000000004";
const BUS = "b0000000-0000-4000-8000-000000000001";
const OFF_BUS = "b0000000-0000-4000-8000-000000000002";
const ACTOR = "u0000000-0000-4000-8000-0000000000aa";
const ACCOUNTANT = "u0000000-0000-4000-8000-0000000000bb";
const BURSAR = "u0000000-0000-4000-8000-0000000000cc";
const ROLE = "r0000000-0000-4000-8000-000000000001";

const fee = (categoryId: string, amount: string, isOptional: boolean, dueDate: string) => ({ feeCategoryId: categoryId, amount: Money.fromDecimalString(amount), isOptional, dueDate });

interface Over {
  parentInvoicingEnabled?: boolean;
  publishInvoicesEnabled?: boolean;
  roles?: string[];
  actor?: string | null;
  /** What the user lookup answers for any saved system-user id (default: an active user named "System User"). */
  actorUser?: { id: string; fullName: string; status: string } | null;
  student?: { studentId: string; admissionNo: string; fullName: string; status: string } | null;
  liveStructureInvoice?: boolean;
  billed?: string[];
  schoolOpted?: string[];
  transportBilled?: boolean;
  existing?: ParentInvoiceRequestRow | null;
  generateError?: Error;
  transportError?: Error;
  notifyError?: Error;
  termEnds?: string;
}

function harness(over: Over = {}) {
  const calls = { refused: [] as any[], created: [] as any[], optIns: [] as any[], generated: [] as any[], posted: [] as string[], transport: [] as any[], notified: [] as any[] };
  let invoiceSeq = 0;
  const repository = {
    insertReceived: jest.fn(async (input: any) => {
      if (over.existing) return { inserted: false, row: over.existing };
      return {
        inserted: true,
        row: { id: "row-1", academyRequestId: input.academyRequestId, academyStudentId: input.academyStudentId, studentId: null, termId: input.termId, parentName: input.parentName, selection: input.selection, mode: null, status: "RECEIVED", refusalCode: null, refusalMessage: null, feeInvoiceId: null, transportInvoiceId: null } as ParentInvoiceRequestRow,
      };
    }),
    findByAcademyRequestId: jest.fn(async () => over.existing ?? null),
    findLinkedStudent: jest.fn(async () => (over.student === undefined ? { studentId: "erp-student-1", admissionNo: "ADM-1001", fullName: "Amina Otieno", status: "ACTIVE" } : over.student)),
    hasLiveStructureInvoice: jest.fn(async () => over.liveStructureInvoice ?? false),
    hasTransportBilled: jest.fn(async () => over.transportBilled ?? false),
    findUserBrief: jest.fn(async (id: string) => (over.actorUser === undefined ? { id, fullName: "System User", status: "ACTIVE" } : over.actorUser)),
    markRefused: jest.fn(async (_id: string, code: string, message: string, studentId: string | null) => void calls.refused.push({ code, message, studentId })),
    markCreated: jest.fn(async (id: string, result: any, em: unknown) => void calls.created.push({ id, result, em })),
    findInvoiceBriefs: jest.fn(async (ids: string[]) => ids.map((id) => ({ id, number: id === "inv-fee" ? "INV-000201" : "INV-000202", total: id === "inv-fee" ? "21500.0000" : "5000.0000", dueDate: "2026-02-28" }))),
    activeUserIdsInRoles: jest.fn(async () => [ACCOUNTANT, BURSAR, ACTOR]),
    activeUserIdsWithPermission: jest.fn(async () => [ACCOUNTANT]),
    existingRoleIds: jest.fn(async (ids: string[]) => ids),
  };
  const stateRepository = {
    getOrCreate: jest.fn(async () => ({
      parentInvoicingEnabled: over.parentInvoicingEnabled ?? true,
      publishInvoicesEnabled: over.publishInvoicesEnabled ?? true,
      parentInvoiceNotifyRoleIds: over.roles ?? [ROLE],
    })),
  };
  const settings = { getTyped: jest.fn(async (key: string) => (over.actor === undefined ? (key.startsWith("academy.") ? ACTOR : null) : over.actor)) };
  const calendar = {
    getCurrentYear: jest.fn(async () => ({ id: "year-1" })),
    listTerms: jest.fn(async () => [
      { id: PAST_TERM, name: "Term 3 2025", seq: 3, isCurrent: false, startsOn: "2025-09-01", endsOn: "2025-11-30" },
      { id: TERM, name: "Term 1 2026", seq: 1, isCurrent: true, startsOn: "2026-01-05", endsOn: over.termEnds ?? "2099-04-10" },
    ]),
  };
  const feeStructures = { findApplicableFor: jest.fn(async () => ({ id: "structure-1" })) };
  const structureLines = {
    listByStructureAndTerm: jest.fn(async () => [fee(TUITION, "20000", false, "2026-02-15"), fee(MILK, "1500", true, "2026-02-15"), fee(LUNCH, "4000", true, "2026-02-28")]),
  };
  const categories = { list: jest.fn(async () => [{ id: TUITION, name: "Tuition" }, { id: MILK, name: "Milk" }, { id: LUNCH, name: "Lunch" }]) };
  const optionalItems = {
    listByStudentAndTerm: jest.fn(async () => (over.schoolOpted ?? []).map((feeCategoryId) => ({ feeCategoryId }))),
    create: jest.fn(async (data: any, em: unknown) => void calls.optIns.push({ data, em })),
  };
  const invoiceLines = { listAlreadyBilledCategoryIds: jest.fn(async () => new Set(over.billed ?? [])) };
  const routes = {
    list: jest.fn(async () => [
      { id: BUS, name: "Route A", amount: Money.fromDecimalString("5000"), isActive: true },
      { id: OFF_BUS, name: "Old route", amount: Money.fromDecimalString("4000"), isActive: false },
    ]),
  };
  const invoicing = {
    generateInvoice: jest.fn(async (em: unknown, input: any) => {
      if (over.generateError) throw over.generateError;
      calls.generated.push({ em, input });
      return { id: ++invoiceSeq === 1 ? "inv-fee" : "inv-other" };
    }),
    postInvoice: jest.fn(async (_em: unknown, id: string) => void calls.posted.push(id)),
  };
  const transport = {
    billStudentOnRoute: jest.fn(async (em: unknown, input: any, actor: string) => {
      if (over.transportError) throw over.transportError;
      calls.transport.push({ em, input, actor });
      return ["inv-transport"];
    }),
  };
  const notifyService = {
    notify: jest.fn(async (input: any) => {
      if (over.notifyError) throw over.notifyError;
      calls.notified.push(input);
    }),
  };
  const publishService = { publishPending: jest.fn(async () => null) };
  const service = new AcademyParentInvoiceService(
    repository as any,
    stateRepository as any,
    settings as any,
    calendar as any,
    feeStructures as any,
    structureLines as any,
    categories as any,
    optionalItems as any,
    invoiceLines as any,
    routes as any,
    invoicing as any,
    transport as any,
    notifyService as any,
    publishService as any,
    {} as any,
  );
  return { service, repository, stateRepository, settings, invoicing, transport, notifyService, publishService, optionalItems, calls };
}

const input = (over: Record<string, unknown> = {}) => ({ requestId: REQ, academyStudentId: ACADEMY_STUDENT, termId: TERM, optionalCategoryIds: [], routeId: null, parentName: "Grace Otieno", ...over }) as any;

describe("AcademyParentInvoiceService.options", () => {
  it("is not available when the school has not switched parent invoicing on", async () => {
    const h = harness({ parentInvoicingEnabled: false });
    const view = await h.service.options(ACADEMY_STUDENT);
    expect(view.available).toBe(false);
    expect(view.terms).toEqual([]);
    expect(view.message).toMatch(/not available/i);
  });

  it("is not available while publishing to the portal is off (the parent would never see what they made)", async () => {
    expect((await harness({ publishInvoicesEnabled: false }).service.options(ACADEMY_STUDENT)).available).toBe(false);
  });

  it("is not available until a system user is configured to record the invoices under", async () => {
    const view = await harness({ actor: null }).service.options(ACADEMY_STUDENT);
    expect(view.available).toBe(false);
    expect(view.message).toMatch(/not finished setting this up/i);
  });

  it("offers, for the current term only (terms already over are not listed), the mandatory lines, optional items and routes with the SCHOOL's amounts", async () => {
    const h = harness();
    const view = await h.service.options(ACADEMY_STUDENT);

    expect(view.available).toBe(true);
    expect(view.terms.map((t) => t.termId)).toEqual([TERM]);
    const term = view.terms[0];
    expect(term.mode).toBe("FULL");
    expect(term.included).toEqual([{ categoryId: TUITION, name: "Tuition", amount: "20000.0000", dueDate: "2026-02-15" }]);
    expect(term.optional.map((o) => [o.name, o.amount])).toEqual([["Milk", "1500.0000"], ["Lunch", "4000.0000"]]);
    expect(term.transportRoutes).toEqual([{ routeId: BUS, name: "Route A", amount: "5000.0000" }]); // the inactive route is never offered
  });

  it("is a TOP_UP when the school already billed the term, and then offers only what is not billed", async () => {
    const h = harness({ liveStructureInvoice: true, billed: [TUITION, MILK] });
    const term = (await h.service.options(ACADEMY_STUDENT)).terms[0];
    expect(term.mode).toBe("TOP_UP");
    expect(term.included).toEqual([]);
    expect(term.optional.map((o) => o.name)).toEqual(["Lunch"]);
  });

  it("answers 404 for a learner this ERP has not linked, and for one who is no longer active", async () => {
    await expect(harness({ student: null }).service.options(ACADEMY_STUDENT)).rejects.toBeInstanceOf(NotFoundException);
    await expect(harness({ student: { studentId: "s", admissionNo: "A", fullName: "X", status: "WITHDRAWN" } }).service.options(ACADEMY_STUDENT)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AcademyParentInvoiceService.create — FULL invoice", () => {
  it("opts the learner into what the parent ticked, generates and posts the term's structure invoice as the system user, all on ONE transaction manager", async () => {
    const h = harness();
    const view = await h.service.create(input({ optionalCategoryIds: [MILK] }));

    expect(EM.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), [expect.stringContaining("erp-student-1")]);
    expect(h.calls.optIns).toHaveLength(1);
    expect(h.calls.optIns[0].data).toMatchObject({ studentId: "erp-student-1", termId: TERM, feeCategoryId: MILK, amountOverride: null, createdBy: ACTOR });
    expect(h.calls.optIns[0].em).toBe(EM);
    expect(h.calls.generated).toHaveLength(1);
    expect(h.calls.generated[0].em).toBe(EM);
    expect(h.calls.generated[0].input).toMatchObject({ studentId: "erp-student-1", termId: TERM, source: "STRUCTURE", createdBy: ACTOR, dueDate: "2026-02-15" });
    expect(h.calls.posted).toEqual(["inv-fee"]);
    expect(h.calls.created[0].em).toBe(EM); // the request flips to CREATED in the same transaction as the invoice
    expect(h.calls.created[0].result).toMatchObject({ studentId: "erp-student-1", mode: "FULL", feeInvoiceId: "inv-fee", transportInvoiceId: null });
    expect(view).toMatchObject({ status: "CREATED", mode: "FULL", total: "21500.0000" });
    expect(view.invoices).toEqual([expect.objectContaining({ invoiceId: "inv-fee", number: "INV-000201", kind: "FEE" })]);
  });

  it("uses the LATEST due date of the invoice's lines so a parent is not made overdue on an item that is not due yet", async () => {
    const h = harness();
    await h.service.create(input({ optionalCategoryIds: [LUNCH] })); // Lunch is due 2026-02-28, Tuition 2026-02-15
    expect(h.calls.generated[0].input.dueDate).toBe("2026-02-28");
  });

  it("can generate the plain mandatory invoice with nothing extra ticked", async () => {
    const h = harness();
    const view = await h.service.create(input());
    expect(h.calls.optIns).toHaveLength(0);
    expect(h.calls.generated[0].input.source).toBe("STRUCTURE");
    expect(view.status).toBe("CREATED");
  });
});

describe("AcademyParentInvoiceService.create — TOP_UP and transport", () => {
  it("adds only the ticked optional items as a small ad-hoc invoice, priced from the structure (never from the request), with no opt-in rows", async () => {
    const h = harness({ liveStructureInvoice: true, billed: [TUITION, MILK] });
    const view = await h.service.create(input({ optionalCategoryIds: [LUNCH] }));

    expect(h.calls.optIns).toHaveLength(0);
    const generated = h.calls.generated[0].input;
    expect(generated.source).toBe("ADHOC");
    expect(generated.adhocLines).toHaveLength(1);
    expect(generated.adhocLines[0]).toMatchObject({ feeCategoryId: LUNCH, description: "Lunch" });
    expect(generated.adhocLines[0].amount.toDecimalString()).toBe("4000.0000");
    expect(view).toMatchObject({ status: "CREATED", mode: "TOP_UP" });
  });

  it("bills the transport route as its own invoice inside the same transaction, due with the term's fees", async () => {
    const h = harness();
    const view = await h.service.create(input({ routeId: BUS, optionalCategoryIds: [MILK] }));

    expect(h.transport.billStudentOnRoute).toHaveBeenCalledTimes(1);
    const [em, args, actor] = h.transport.billStudentOnRoute.mock.calls[0] as any[];
    expect(em).toBe(EM);
    expect(args).toEqual({ studentId: "erp-student-1", routeId: BUS, termId: TERM, dueDate: "2026-02-28" });
    expect(actor).toBe(ACTOR);
    expect(view.invoices.map((i) => i.kind)).toEqual(["FEE", "TRANSPORT"]);
    expect(view.total).toBe("26500.0000");
    expect(h.calls.created[0].result.transportInvoiceId).toBe("inv-transport");
  });

  it("can be transport only on a top-up (no fee invoice at all)", async () => {
    const h = harness({ liveStructureInvoice: true, billed: [TUITION, MILK, LUNCH] });
    const view = await h.service.create(input({ routeId: BUS }));
    expect(h.calls.generated).toHaveLength(0);
    expect(view.status).toBe("CREATED");
    expect(view.invoices.map((i) => i.kind)).toEqual(["TRANSPORT"]);
  });
});

describe("AcademyParentInvoiceService.create — what is refused, and that nothing is created", () => {
  async function refused(over: Over, body: Record<string, unknown>, code: string) {
    const h = harness(over);
    const view = await h.service.create(input(body));
    expect(view.status).toBe("REFUSED");
    expect(view.code).toBe(code);
    expect(view.invoices).toEqual([]);
    expect(h.invoicing.generateInvoice).not.toHaveBeenCalled();
    expect(h.transport.billStudentOnRoute).not.toHaveBeenCalled();
    expect(h.optionalItems.create).not.toHaveBeenCalled();
    expect(h.notifyService.notify).not.toHaveBeenCalled();
    expect(h.calls.refused[0].code).toBe(code);
    return h;
  }

  it("FEATURE_OFF when the school has not switched it on", () => refused({ parentInvoicingEnabled: false }, {}, "FEATURE_OFF"));
  it("FEATURE_OFF when publishing to the portal is off", () => refused({ publishInvoicesEnabled: false }, {}, "FEATURE_OFF"));
  it("NOT_READY without a system user", () => refused({ actor: null }, {}, "NOT_READY"));
  it("STUDENT_NOT_LINKED for a learner this ERP does not know", () => refused({ student: null }, {}, "STUDENT_NOT_LINKED"));
  it("STUDENT_NOT_LINKED for a learner who is not active", () => refused({ student: { studentId: "s", admissionNo: "A", fullName: "X", status: "ALUMNI" } }, {}, "STUDENT_NOT_LINKED"));
  it("TERM_NOT_AVAILABLE for a term that is over", () => refused({}, { termId: PAST_TERM }, "TERM_NOT_AVAILABLE"));
  it("TERM_NOT_AVAILABLE for a term that does not exist", () => refused({}, { termId: "t0000000-0000-4000-8000-0000000000ff" }, "TERM_NOT_AVAILABLE"));
  it("ITEM_NOT_OFFERED for a MANDATORY category (a parent can only pick optional items)", () => refused({}, { optionalCategoryIds: [TUITION] }, "ITEM_NOT_OFFERED"));
  it("ITEM_NOT_OFFERED for a category that is not on the structure", () => refused({}, { optionalCategoryIds: ["c0000000-0000-4000-8000-0000000000ff"] }, "ITEM_NOT_OFFERED"));
  it("ITEM_NOT_OFFERED for an optional item already billed", () => refused({ liveStructureInvoice: true, billed: [TUITION, MILK] }, { optionalCategoryIds: [MILK] }, "ITEM_NOT_OFFERED"));
  it("ROUTE_NOT_OFFERED for an inactive route", () => refused({}, { routeId: OFF_BUS }, "ROUTE_NOT_OFFERED"));
  it("ROUTE_NOT_OFFERED when the learner is already billed for transport this term", () => refused({ transportBilled: true }, { routeId: BUS }, "ROUTE_NOT_OFFERED"));
  it("NOTHING_TO_ADD for an empty top-up", () => refused({ liveStructureInvoice: true, billed: [TUITION] }, {}, "NOTHING_TO_ADD"));

  it("records the refusal's own wording, which is written for a parent", async () => {
    const h = await refused({ parentInvoicingEnabled: false }, {}, "FEATURE_OFF");
    expect(h.calls.refused[0].message).toMatch(/school office/i);
  });
});

describe("AcademyParentInvoiceService — an id that cannot be one of the Academy's", () => {
  const TOO_LONG = "x".repeat(65); // acad_parent_invoice_request.academy_student_id is varchar(64)

  it("options: 404, and nothing is read", async () => {
    const h = harness();
    await expect(h.service.options(TOO_LONG)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.repository.findLinkedStudent).not.toHaveBeenCalled();
  });

  it("create: refused as 'not linked' WITHOUT writing a row (it would not even fit), and nothing is created", async () => {
    const h = harness();
    const view = await h.service.create(input({ academyStudentId: TOO_LONG }));
    expect(view).toMatchObject({ status: "REFUSED", code: "STUDENT_NOT_LINKED", invoices: [] });
    expect(h.repository.insertReceived).not.toHaveBeenCalled();
    expect(h.invoicing.generateInvoice).not.toHaveBeenCalled();
  });
});

describe("AcademyParentInvoiceService.create — idempotency and races", () => {
  const stored = (over: Partial<ParentInvoiceRequestRow> = {}): ParentInvoiceRequestRow => ({
    id: "row-0",
    academyRequestId: REQ,
    academyStudentId: ACADEMY_STUDENT,
    studentId: "erp-student-1",
    termId: TERM,
    parentName: "Grace Otieno",
    selection: { optionalCategoryIds: [MILK], routeId: null },
    mode: "FULL",
    status: "CREATED",
    refusalCode: null,
    refusalMessage: null,
    feeInvoiceId: "inv-fee",
    transportInvoiceId: null,
    ...over,
  });

  it("a repeat of the same request reports on the first answer and creates NOTHING", async () => {
    const h = harness({ existing: stored() });
    const view = await h.service.create(input({ optionalCategoryIds: [MILK] }));
    expect(view).toMatchObject({ status: "CREATED", mode: "FULL", total: "21500.0000" });
    expect(h.invoicing.generateInvoice).not.toHaveBeenCalled();
    expect(h.notifyService.notify).not.toHaveBeenCalled(); // and does not notify twice
  });

  it("a repeat of a refused request answers the same refusal", async () => {
    const h = harness({ existing: stored({ status: "REFUSED", feeInvoiceId: null, refusalCode: "ALREADY_ISSUED", refusalMessage: "The school has just issued this term's invoice." }) });
    const view = await h.service.create(input({ optionalCategoryIds: [MILK] }));
    expect(view).toMatchObject({ status: "REFUSED", code: "ALREADY_ISSUED" });
  });

  it("a request still being processed answers PENDING rather than guessing", async () => {
    const h = harness({ existing: stored({ status: "RECEIVED", feeInvoiceId: null, mode: null }) });
    expect((await h.service.create(input({ optionalCategoryIds: [MILK] }))).status).toBe("PENDING");
  });

  it("the same request id with a DIFFERENT choice is refused outright (409), not silently answered", async () => {
    const h = harness({ existing: stored() });
    await expect(h.service.create(input({ optionalCategoryIds: [LUNCH] }))).rejects.toBeInstanceOf(ConflictException);
    await expect(h.service.create(input({ optionalCategoryIds: [MILK], routeId: BUS }))).rejects.toBeInstanceOf(ConflictException);
    await expect(h.service.create(input({ optionalCategoryIds: [MILK], academyStudentId: "someone-else" }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("the order the items were ticked in does not matter", async () => {
    const h = harness({ existing: stored({ selection: { optionalCategoryIds: [LUNCH, MILK].sort(), routeId: null } }) });
    await expect(h.service.create(input({ optionalCategoryIds: [MILK, LUNCH] }))).resolves.toMatchObject({ status: "CREATED" });
  });

  it("when the school generated the term's invoice meanwhile (BR-BILL-04) the parent is told so, and nothing is notified", async () => {
    const h = harness({ generateError: new ConflictException("BR-BILL-04: student already has a live structure-generated invoice") });
    const view = await h.service.create(input({ optionalCategoryIds: [MILK] }));
    expect(view).toMatchObject({ status: "REFUSED", code: "ALREADY_ISSUED" });
    expect(h.notifyService.notify).not.toHaveBeenCalled();
    expect(h.calls.created).toHaveLength(0);
  });

  it("an unexpected failure gives the parent a safe sentence, never the error text, and creates nothing that is reported", async () => {
    const h = harness({ generateError: new Error('relation "bill_invoice" does not exist at /srv/secret/path') });
    const view = await h.service.create(input({ optionalCategoryIds: [MILK] }));
    expect(view).toMatchObject({ status: "REFUSED", code: "NOT_CREATED" });
    expect(JSON.stringify(view)).not.toMatch(/relation|secret|srv/);
    expect(h.notifyService.notify).not.toHaveBeenCalled();
  });

  it("if the transport invoice cannot be made, the whole request fails (the fee invoice is rolled back with it, and never reported or notified)", async () => {
    const h = harness({ transportError: new Error("route gone") });
    const view = await h.service.create(input({ routeId: BUS, optionalCategoryIds: [MILK] }));
    expect(view).toMatchObject({ status: "REFUSED", code: "NOT_CREATED" });
    expect(h.calls.created).toHaveLength(0); // markCreated is in the same transaction, so it never ran
    expect(h.notifyService.notify).not.toHaveBeenCalled();
  });
});

describe("AcademyParentInvoiceService.create — telling accounts and the portal", () => {
  it("notifies every active user in the chosen roles (not the system user), once each, naming the parent, learner, invoice and total", async () => {
    const h = harness();
    await h.service.create(input({ optionalCategoryIds: [MILK], routeId: BUS }));

    expect(h.repository.activeUserIdsInRoles).toHaveBeenCalledWith([ROLE]);
    expect(h.calls.notified.map((n) => n.userId).sort()).toEqual([ACCOUNTANT, BURSAR].sort());
    const note = h.calls.notified[0];
    expect(note.type).toBe("PARENT_INVOICE_CREATED");
    expect(note.title).toBe("Invoice created by a parent");
    expect(note.body).toContain("Grace Otieno has created invoices INV-000201, INV-000202");
    expect(note.body).toContain("Amina Otieno (ADM-1001)");
    expect(note.body).toContain("Term 1 2026");
    expect(note.body).toContain("KES 26,500");
    expect(note.link).toBe("/billing/invoices/inv-fee");
    expect(note.entityId).toBe("inv-fee");
  });

  it("falls back to everyone who can post invoices when the school chose no role", async () => {
    const h = harness({ roles: [] });
    await h.service.create(input({ optionalCategoryIds: [MILK] }));
    expect(h.repository.activeUserIdsInRoles).not.toHaveBeenCalled();
    expect(h.repository.activeUserIdsWithPermission).toHaveBeenCalledWith("billing:invoice:post");
    expect(h.calls.notified.map((n) => n.userId)).toEqual([ACCOUNTANT]);
  });

  it("says 'A parent' when the Academy sent no name", async () => {
    const h = harness();
    await h.service.create(input({ optionalCategoryIds: [MILK], parentName: undefined }));
    expect(h.calls.notified[0].body).toMatch(/^A parent has created an invoice INV-000201/);
  });

  it("publishes the learner's invoices to the portal straight away", async () => {
    const h = harness();
    await h.service.create(input({ optionalCategoryIds: [MILK] }));
    expect(h.publishService.publishPending).toHaveBeenCalledWith({ studentId: "erp-student-1", maxBatches: 1 });
  });

  it("a notification (or publishing) problem never undoes or fails the invoice", async () => {
    const h = harness({ notifyError: new Error("inbox down") });
    h.publishService.publishPending.mockRejectedValueOnce(new Error("academy down"));
    const view = await h.service.create(input({ optionalCategoryIds: [MILK] }));
    expect(view.status).toBe("CREATED");
    expect(view.invoices).toHaveLength(1);
  });
});

describe("AcademyParentInvoiceService.getStatus", () => {
  it("answers 404 for an unknown request", async () => {
    await expect(harness().service.getStatus(REQ)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AcademyParentInvoiceService.actorStatus — which user the invoices are recorded under", () => {
  const PARENT_KEY_USER = "u0000000-0000-4000-8000-0000000000aa";

  it("is this feature's own setting when it names an active user", async () => {
    const h = harness();
    expect(await h.service.actorStatus()).toEqual({ configured: true, source: "PARENT_INVOICES", userId: ACTOR, userName: "System User", userActive: true });
  });

  it("falls back to the existing M-Pesa system cashier when this feature's own setting is not set, and says so", async () => {
    const h = harness();
    h.settings.getTyped.mockImplementation(async (key: string) => (key.startsWith("payments.") ? PARENT_KEY_USER : null));
    expect(await h.service.actorStatus()).toMatchObject({ configured: true, source: "MPESA", userId: PARENT_KEY_USER });
  });

  it("skips a saved user who is no longer active and uses the next one that works", async () => {
    const h = harness();
    h.settings.getTyped.mockImplementation(async (key: string) => (key.startsWith("academy.") ? "u-inactive" : PARENT_KEY_USER));
    h.repository.findUserBrief.mockImplementation(async (id: string) => ({ id, fullName: id === "u-inactive" ? "Left School" : "Cashier", status: id === "u-inactive" ? "SUSPENDED" : "ACTIVE" }));
    expect(await h.service.actorStatus()).toMatchObject({ configured: true, source: "MPESA", userName: "Cashier" });
  });

  it("when the only saved user is not active, reports THAT user (so the school can see why) as not usable", async () => {
    const h = harness({ actorUser: { id: ACTOR, fullName: "Left School", status: "SUSPENDED" } });
    expect(await h.service.actorStatus()).toEqual({ configured: false, source: "PARENT_INVOICES", userId: ACTOR, userName: "Left School", userActive: false });
    const view = await h.service.options(ACADEMY_STUDENT);
    expect(view.available).toBe(false); // and parents are told the school has not finished setting it up
  });

  it("when a saved id points at no user at all, it is not usable and has no name", async () => {
    const h = harness({ actorUser: null });
    expect(await h.service.actorStatus()).toEqual({ configured: false, source: "PARENT_INVOICES", userId: ACTOR, userName: null, userActive: false });
  });

  it("nothing saved: not configured, no source", async () => {
    const h = harness({ actor: null });
    expect(await h.service.actorStatus()).toEqual({ configured: false, source: null, userId: null, userName: null, userActive: false });
  });
});

describe("AcademyParentInvoiceService.readiness", () => {
  it("lists what is missing", async () => {
    const h = harness({ publishInvoicesEnabled: false, actor: null });
    expect((await h.service.readiness(false)).issues).toEqual(["NOT_CONNECTED", "PUBLISHING_OFF", "NO_SYSTEM_USER"]);
    expect((await harness().service.readiness(true)).issues).toEqual([]);
  });
});
