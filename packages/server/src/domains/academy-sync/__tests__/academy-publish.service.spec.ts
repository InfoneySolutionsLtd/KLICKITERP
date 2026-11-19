/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { AcademyPublishOutboxHandler, ACADEMY_PUBLISH_EVENT_TYPES } from "../application/academy-publish-outbox.handler";
import { AcademyPublishService } from "../application/academy-publish.service";
import { InvoiceSnapshot } from "../infrastructure/academy-invoice-snapshot.repository";

const snapshot = (n: number, over: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot => ({
  erpInvoiceId: `inv-${n}`,
  academyStudentId: `ac-${n}`,
  number: `INV-${String(n).padStart(6, "0")}`,
  termName: "2026 Term 1",
  issueDate: "2026-01-05",
  dueDate: "2026-01-31",
  status: "POSTED",
  source: "STRUCTURE",
  currency: "KES",
  total: "15000.0000",
  paidAmount: "0.0000",
  balance: "15000.0000",
  version: n,
  lines: [{ description: "Tuition", amount: "15000.0000", concessionAmount: "0.0000" }],
  ...over,
});

function makeHarness(over: { enabled?: boolean; connected?: boolean; lockHeld?: boolean; pages?: InvoiceSnapshot[][]; reply?: (invoices: InvoiceSnapshot[]) => any; syncError?: Error; sink?: unknown; lastPublishOk?: boolean | null } = {}) {
  const state: any = { publishInvoicesEnabled: over.enabled ?? true, lastPublishAt: null, lastPublishOk: over.lastPublishOk ?? null, lastPublishMessage: null };
  const pages = [...(over.pages ?? [[]])];
  const published: Array<[string, number]> = [];
  const rejected: Array<[string, string]> = [];
  const academyLink = { getConnection: jest.fn(async () => (over.connected === false ? null : { apiKey: "kfe_test_key", academySchoolId: "s1", academySchoolCode: "S" })) };
  const client = {
    syncInvoices: jest.fn(async (_key: string, invoices: InvoiceSnapshot[]) => {
      if (over.syncError) throw over.syncError;
      return over.reply ? over.reply(invoices) : { results: invoices.map((i) => ({ erpInvoiceId: i.erpInvoiceId, outcome: "CREATED" })) };
    }),
  };
  const snapshots = {
    findPending: jest.fn(async () => pages.shift() ?? []),
    counts: jest.fn(async () => ({ pending: 3, rejected: 1, published: 40 })),
    recentRejections: jest.fn(async () => [{ invoiceNumber: "INV-000009", reason: "no such student", at: new Date() }]),
    markPublished: jest.fn(async (id: string, version: number) => void published.push([id, version])),
    markRejected: jest.fn(async (id: string, reason: string) => void rejected.push([id, reason])),
  };
  const stateRepository = { getOrCreate: jest.fn(async () => state), save: jest.fn(async (s: any) => s) };
  const redis = { set: jest.fn(async () => (over.lockHeld ? null : "OK")), expire: jest.fn(async () => 1), eval: jest.fn(async () => 1) };
  const service = new AcademyPublishService(academyLink as any, client as any, snapshots as any, stateRepository as any, redis as any, over.sink as any);
  return { service, state, academyLink, client, snapshots, stateRepository, redis, published, rejected };
}

describe("AcademyPublishService.publishPending", () => {
  it("does nothing while publishing is switched off — nothing leaves the ERP", async () => {
    const h = makeHarness({ enabled: false, pages: [[snapshot(1)]] });
    expect(await h.service.publishPending()).toBeNull();
    expect(h.client.syncInvoices).not.toHaveBeenCalled();
    expect(h.redis.set).not.toHaveBeenCalled();
  });

  it("does nothing when the ERP is not connected to an Academy school", async () => {
    const h = makeHarness({ connected: false, pages: [[snapshot(1)]] });
    expect(await h.service.publishPending()).toBeNull();
    expect(h.client.syncInvoices).not.toHaveBeenCalled();
  });

  it("does nothing when another run holds the lock", async () => {
    const h = makeHarness({ lockHeld: true, pages: [[snapshot(1)]] });
    expect(await h.service.publishPending()).toBeNull();
    expect(h.client.syncInvoices).not.toHaveBeenCalled();
    expect(h.redis.eval).not.toHaveBeenCalled(); // never releases a lock it did not take
  });

  it("sends what is pending with the school's key and records each accepted version", async () => {
    const h = makeHarness({ pages: [[snapshot(1), snapshot(2, { version: 7 })]] });
    const result = await h.service.publishPending();
    expect(h.client.syncInvoices).toHaveBeenCalledWith("kfe_test_key", expect.arrayContaining([expect.objectContaining({ erpInvoiceId: "inv-1" })]));
    expect(result).toMatchObject({ sent: 2, created: 2, rejected: 0, error: null });
    expect(h.published).toEqual([["inv-1", 1], ["inv-2", 7]]);
  });

  it("counts every outcome the Academy can answer with", async () => {
    const outcomes = ["CREATED", "UPDATED", "UNCHANGED", "STALE"];
    const h = makeHarness({
      pages: [[snapshot(1), snapshot(2), snapshot(3), snapshot(4)]],
      reply: (inv) => ({ results: inv.map((i, idx) => ({ erpInvoiceId: i.erpInvoiceId, outcome: outcomes[idx] })) }),
    });
    expect(await h.service.publishPending()).toMatchObject({ created: 1, updated: 1, unchanged: 1, stale: 1, rejected: 0 });
    expect(h.published).toHaveLength(4);
  });

  it("records a rejection with the Academy's reason and does NOT mark it published", async () => {
    const h = makeHarness({
      pages: [[snapshot(1), snapshot(2)]],
      reply: (inv) => ({ results: [{ erpInvoiceId: "inv-1", outcome: "CREATED" }, { erpInvoiceId: inv[1].erpInvoiceId, outcome: "REJECTED", reason: "That student does not belong to this school." }] }),
    });
    const result = await h.service.publishPending();
    expect(result).toMatchObject({ created: 1, rejected: 1 });
    expect(h.published).toEqual([["inv-1", 1]]);
    expect(h.rejected).toEqual([["inv-2", "That student does not belong to this school."]]);
  });

  it("never assumes an invoice arrived when the Academy's answer does not mention it", async () => {
    const h = makeHarness({ pages: [[snapshot(1), snapshot(2)]], reply: () => ({ results: [{ erpInvoiceId: "inv-1", outcome: "CREATED" }] }) });
    await h.service.publishPending();
    expect(h.published).toEqual([["inv-1", 1]]);
    expect(h.rejected.map(([id]) => id)).toEqual(["inv-2"]);
  });

  it("keeps going through full batches and stops on a short one", async () => {
    const full = Array.from({ length: 100 }, (_, i) => snapshot(i + 1));
    const h = makeHarness({ pages: [full, full.map((s) => ({ ...s, erpInvoiceId: `b-${s.erpInvoiceId}` })), [snapshot(500)]] });
    const result = await h.service.publishPending();
    expect(h.client.syncInvoices).toHaveBeenCalledTimes(3);
    expect(result?.sent).toBe(201);
  });

  it("stops after the batch limit so one run cannot hog the worker", async () => {
    const full = Array.from({ length: 100 }, (_, i) => snapshot(i + 1));
    const h = makeHarness({ pages: Array.from({ length: 10 }, () => full) });
    await h.service.publishPending({ maxBatches: 2 });
    expect(h.client.syncInvoices).toHaveBeenCalledTimes(2);
  });

  it("stops instead of looping when an entire batch is rejected", async () => {
    const full = Array.from({ length: 100 }, (_, i) => snapshot(i + 1));
    const h = makeHarness({ pages: [full, full], reply: (inv) => ({ results: inv.map((i) => ({ erpInvoiceId: i.erpInvoiceId, outcome: "REJECTED", reason: "no" })) }) });
    await h.service.publishPending();
    expect(h.client.syncInvoices).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and records nothing, when there is nothing to send", async () => {
    const h = makeHarness({ pages: [[]] });
    const result = await h.service.publishPending();
    expect(result).toMatchObject({ sent: 0, error: null });
    expect(h.client.syncInvoices).not.toHaveBeenCalled();
    expect(h.stateRepository.save).not.toHaveBeenCalled();
  });

  describe("when the Academy cannot be reached", () => {
    it("leaves everything pending (no per-invoice blame) and records the failure", async () => {
      const h = makeHarness({ pages: [[snapshot(1), snapshot(2)]], syncError: new Error("Academy Gateway unreachable (ECONNREFUSED)") });
      const result = await h.service.publishPending();
      expect(result?.error).toContain("ECONNREFUSED");
      expect(h.published).toEqual([]);
      expect(h.rejected).toEqual([]);
      expect(h.state).toMatchObject({ lastPublishOk: false, lastPublishMessage: expect.stringContaining("ECONNREFUSED") });
    });

    it("still releases the lock", async () => {
      const h = makeHarness({ pages: [[snapshot(1)]], syncError: new Error("down") });
      await h.service.publishPending();
      expect(h.redis.eval).toHaveBeenCalledTimes(1);
    });
  });

  it("releases the lock with its own token only", async () => {
    const h = makeHarness({ pages: [[snapshot(1)]] });
    await h.service.publishPending();
    const lockToken = (h.redis.set.mock.calls[0] as unknown as any[])[1];
    const evalArgs = h.redis.eval.mock.calls[0] as unknown as any[];
    expect(evalArgs[evalArgs.length - 1]).toBe(lockToken);
  });

  describe("recording the run", () => {
    it("a full sweep records its headline result", async () => {
      const h = makeHarness({ pages: [[snapshot(1)]] });
      await h.service.publishPending();
      expect(h.state).toMatchObject({ lastPublishOk: true, lastPublishMessage: expect.stringMatching(/Sent 1: 1 new/) });
      expect(h.state.lastPublishAt).toBeInstanceOf(Date);
    });

    it("a successful one-student publish (after an event) does not overwrite the last sweep's headline", async () => {
      const h = makeHarness({ pages: [[snapshot(1)]] });
      h.state.lastPublishMessage = "Sent 500: ...";
      await h.service.publishPending({ studentId: "stu-1", maxBatches: 1 });
      expect(h.state.lastPublishMessage).toBe("Sent 500: ...");
      expect(h.published).toHaveLength(1); // but it still published
    });

    it("a failed one-student publish IS recorded", async () => {
      const h = makeHarness({ pages: [[snapshot(1)]], syncError: new Error("down") });
      await h.service.publishPending({ studentId: "stu-1", maxBatches: 1 });
      expect(h.state.lastPublishOk).toBe(false);
    });

    it("a sweep with a rejection is reported as not fully OK", async () => {
      const h = makeHarness({ pages: [[snapshot(1)]], reply: (inv) => ({ results: [{ erpInvoiceId: inv[0].erpInvoiceId, outcome: "REJECTED", reason: "x" }] }) });
      await h.service.publishPending();
      expect(h.state.lastPublishOk).toBe(false);
      expect(h.state.lastPublishMessage).toMatch(/1 not accepted/);
    });
  });

  describe("tells the people who manage the Academy link when publishing STARTS failing (the bell)", () => {
    const failing = (over: { lastPublishOk?: boolean | null; sink: unknown }) =>
      makeHarness({ pages: [[snapshot(1)]], syncError: new Error("Academy Gateway unreachable (ECONNREFUSED)"), ...over });

    it("the first failure raises ACADEMY_PUBLISH_FAILING with the reason, linking to the Licence page", async () => {
      const sink = { emit: jest.fn(async () => 1) };
      const h = failing({ sink });
      await h.service.publishPending();
      expect(sink.emit).toHaveBeenCalledTimes(1);
      expect(sink.emit).toHaveBeenCalledWith({ code: "ACADEMY_PUBLISH_FAILING", params: { reason: "Academy Gateway unreachable (ECONNREFUSED)" }, link: "/license", entityType: "acad_sync_state" });
    });

    it("a sweep that fails again while it is ALREADY failing says nothing more (no message every few minutes)", async () => {
      const sink = { emit: jest.fn(async () => 1) };
      const h = failing({ sink, lastPublishOk: false });
      await h.service.publishPending();
      expect(sink.emit).not.toHaveBeenCalled();
    });

    it("after a successful sweep it can start failing again, and says so again", async () => {
      const sink = { emit: jest.fn(async () => 1) };
      const h = failing({ sink, lastPublishOk: true });
      await h.service.publishPending();
      expect(sink.emit).toHaveBeenCalledTimes(1);
    });

    it("a successful sweep says nothing", async () => {
      const sink = { emit: jest.fn(async () => 1) };
      const h = makeHarness({ pages: [[snapshot(1)]], sink });
      await h.service.publishPending();
      expect(sink.emit).not.toHaveBeenCalled();
    });

    it("a sweep where the Academy rejects invoices counts as failing too, with the not-accepted message", async () => {
      const sink = { emit: jest.fn(async () => 1) };
      const h = makeHarness({ pages: [[snapshot(1)]], sink, reply: (invoices) => ({ results: invoices.map((i) => ({ erpInvoiceId: i.erpInvoiceId, outcome: "REJECTED", reason: "no such student" })) }) });
      await h.service.publishPending();
      expect(sink.emit).toHaveBeenCalledTimes(1);
      expect((sink.emit.mock.calls[0] as unknown as [{ params: { reason: string } }])[0].params.reason).toMatch(/not accepted/);
    });

    it("a successful one-student publish after an event is not recorded and says nothing, even right after a failure", async () => {
      const sink = { emit: jest.fn(async () => 1) };
      const h = makeHarness({ pages: [[snapshot(1)]], sink, lastPublishOk: false });
      await h.service.publishPending({ studentId: "s1" } as never);
      expect(sink.emit).not.toHaveBeenCalled();
    });
  });

  it("passes the student filter through to the query", async () => {
    const h = makeHarness({ pages: [[snapshot(1)]] });
    await h.service.publishPending({ studentId: "stu-1", maxBatches: 1 });
    expect(h.snapshots.findPending).toHaveBeenCalledWith(100, "stu-1");
  });
});

describe("AcademyPublishService status and switch", () => {
  it("reports where things stand", async () => {
    const status = await makeHarness().service.getStatus();
    expect(status).toMatchObject({ connected: true, enabled: true, pending: 3, rejected: 1, published: 40 });
    expect(status.recentRejections[0].invoiceNumber).toBe("INV-000009");
  });

  it("refuses to switch publishing ON when the ERP is not connected, but lets it be switched off", async () => {
    const h = makeHarness({ connected: false, enabled: false });
    await expect(h.service.setEnabled(true, "admin")).rejects.toBeInstanceOf(ValidationException);
    await expect(h.service.setEnabled(false, "admin")).resolves.toMatchObject({ publishInvoicesEnabled: false });
  });

  it("switches on and records who did it", async () => {
    const h = makeHarness({ enabled: false });
    await h.service.setEnabled(true, "admin-1");
    expect(h.state).toMatchObject({ publishInvoicesEnabled: true, updatedBy: "admin-1" });
  });
});

describe("AcademyPublishOutboxHandler", () => {
  const makeHandler = (publish: jest.Mock, eventType = "billing.invoice_posted") => new AcademyPublishOutboxHandler(eventType, { publishPending: publish } as any);

  it("covers exactly the events that change what a family owes", () => {
    expect([...ACADEMY_PUBLISH_EVENT_TYPES]).toEqual(["billing.invoice_posted", "payments.payment_received"]);
  });

  it("has its own idempotency ledger name, separate from the webhook dispatcher's", () => {
    expect(makeHandler(jest.fn()).consumerName).toBe("academy-publish:billing.invoice_posted");
    expect(makeHandler(jest.fn(), "payments.payment_received").consumerName).toBe("academy-publish:payments.payment_received");
  });

  it("re-publishes that student's pending invoices right away, one batch", async () => {
    const publish = jest.fn(async () => null);
    await makeHandler(publish).handle({ studentId: "stu-1", invoiceId: "inv-1" });
    expect(publish).toHaveBeenCalledWith({ studentId: "stu-1", maxBatches: 1 });
  });

  it.each([[{}], [{ studentId: "" }], [{ studentId: 42 }], [{ studentId: null }]])("ignores an event with no usable student id (%j)", async (payload) => {
    const publish = jest.fn();
    await makeHandler(publish).handle(payload as any);
    expect(publish).not.toHaveBeenCalled();
  });

  it("swallows a failure so the outbox row is not stuck retrying (the sweep is the safety net)", async () => {
    const publish = jest.fn(async () => {
      throw new Error("Academy down");
    });
    await expect(makeHandler(publish).handle({ studentId: "stu-1" })).resolves.toBeUndefined();
  });
});
