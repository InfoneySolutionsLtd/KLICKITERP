/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { AcademyReceiptService, webOriginOf } from "../application/academy-receipt.service";

/**
 * A receipt is only ever found THROUGH its learner: the Academy names a learner it has verified is the signed-in parent's own
 * child, and this service answers only about receipts of THAT learner.
 */
const LEARNER = "ac-learner-1";
const OTHER = "ac-learner-2";

interface Options {
  linked?: string[];
  registeredBaseUrl?: string | null;
  /** learner -> receipt ids that really belong to them */
  owns?: Record<string, string[]>;
}

function harness(opts: Options = {}) {
  const linked = new Set(opts.linked ?? [LEARNER, OTHER]);
  const owns = opts.owns ?? { [LEARNER]: ["r-1", "r-2"], [OTHER]: ["r-9"] };
  const heads: Record<string, any[]> = {
    [LEARNER]: [
      { id: "r-2", number: "RCP-000002", date: "2026-03-10", amount: "1000.0000", status: "POSTED" },
      { id: "r-1", number: "RCP-000001", date: "2026-02-01", amount: "5000.0000", status: "REVERSED" },
    ],
    [OTHER]: [{ id: "r-9", number: "RCP-000009", date: "2026-03-01", amount: "777.0000", status: "POSTED" }],
  };
  const repository = {
    isLinked: jest.fn(async (id: string) => linked.has(id)),
    registeredBaseUrl: jest.fn(async () => (opts.registeredBaseUrl === undefined ? "https://erp.school.example/api/v1" : opts.registeredBaseUrl)),
    findForStudent: jest.fn(async (id: string) => heads[id] ?? []),
    belongsTo: jest.fn(async (learner: string, receipt: string) => (owns[learner] ?? []).includes(receipt)),
    findSplits: jest.fn(async (ids: string[]) =>
      [
        { receiptId: "r-2", method: "MPESA_STK", externalRef: "QWE123" },
        { receiptId: "r-1", method: "CHEQUE", externalRef: "CHQ-77" },
        { receiptId: "r-9", method: "CASH", externalRef: null },
      ].filter((s) => ids.includes(s.receiptId)),
    ),
    findAllocations: jest.fn(async (ids: string[]) =>
      [
        { receiptId: "r-2", amount: "1000.0000", toPrepayment: false, invoiceNumber: "INV-000101" },
        { receiptId: "r-1", amount: "5000.0000", toPrepayment: true, invoiceNumber: null },
      ].filter((a) => ids.includes(a.receiptId)),
    ),
  };
  const receiptPdf = {
    render: jest.fn(async (id: string) => ({ filename: `receipt-${id}.pdf`, buffer: Buffer.from("%PDF-1.7 fake") })),
    readiness: jest.fn(async () => ({ canIssue: true, complete: true, issues: [] })),
  };
  const service = new AcademyReceiptService(repository as any, receiptPdf as any);
  return { service, repository, receiptPdf };
}

describe("AcademyReceiptService.list", () => {
  it("lists the learner's receipts with how they were paid and where the money went", async () => {
    const { receipts } = await harness().service.list(LEARNER);
    expect(receipts.map((r) => r.number)).toEqual(["RCP-000002", "RCP-000001"]);
    expect(receipts[0]).toEqual({
      id: "r-2",
      number: "RCP-000002",
      date: "2026-03-10",
      amount: "1000.0000",
      currency: "KES",
      status: "VALID",
      methods: [{ label: "M-Pesa", reference: "QWE123" }],
      appliedTo: [{ label: "Invoice INV-000101", amount: "1000.0000" }],
    });
  });

  it("marks a reversed receipt REVERSED (it no longer counts), and shows advance payments as such", async () => {
    const { receipts } = await harness().service.list(LEARNER);
    expect(receipts[1]).toMatchObject({ status: "REVERSED", appliedTo: [{ label: "Advance payment (credit on the account)", amount: "5000.0000" }] });
  });

  it("never shows a cheque number, and carries only the documented fields", async () => {
    const { receipts } = await harness().service.list(LEARNER);
    expect(JSON.stringify(receipts)).not.toContain("CHQ-77");
    expect(Object.keys(receipts[0]).sort()).toEqual(["amount", "appliedTo", "currency", "date", "id", "methods", "number", "status"]);
  });

  it("asks only about the learner it was given — another learner's receipts never appear", async () => {
    const h = harness();
    const { receipts } = await h.service.list(LEARNER);
    expect(h.repository.findForStudent).toHaveBeenCalledWith(LEARNER, expect.any(Number));
    expect(receipts.some((r) => r.id === "r-9")).toBe(false);
    expect(JSON.stringify(receipts)).not.toContain("777.0000");
  });

  it("a learner this ERP has not linked is a not-found (and nothing about receipts is read)", async () => {
    const h = harness({ linked: [] });
    await expect(h.service.list(LEARNER)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.repository.findForStudent).not.toHaveBeenCalled();
  });

  it("a learner with no receipts is an empty list, not an error", async () => {
    const h = harness({ linked: ["ac-new"] });
    expect(await h.service.list("ac-new")).toEqual({ receipts: [] });
  });

  it("never asks for more than the cap, however much is requested", async () => {
    const h = harness();
    await h.service.list(LEARNER, 100000);
    expect(h.repository.findForStudent).toHaveBeenCalledWith(LEARNER, 100);
  });
});

describe("AcademyReceiptService.pdf — a receipt is only printed for its own learner", () => {
  it("prints the learner's own receipt", async () => {
    const h = harness();
    const result = await h.service.pdf(LEARNER, "r-1");
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(h.receiptPdf.render).toHaveBeenCalledWith("r-1", { fallbackWebUrl: "https://erp.school.example" });
  });

  it("another learner's receipt id, asked for under THIS learner, is a not-found and is never rendered", async () => {
    const h = harness();
    await expect(h.service.pdf(LEARNER, "r-9")).rejects.toBeInstanceOf(NotFoundException);
    expect(h.receiptPdf.render).not.toHaveBeenCalled();
  });

  it("a receipt that does not exist, and one that is not this learner's, are the same not-found", async () => {
    const h = harness();
    const foreign = await h.service.pdf(LEARNER, "r-9").catch((e) => e);
    const missing = await h.service.pdf(LEARNER, "r-does-not-exist").catch((e) => e);
    expect(foreign).toBeInstanceOf(NotFoundException);
    expect(missing).toBeInstanceOf(NotFoundException);
    expect(foreign.constructor).toBe(missing.constructor);
    expect(h.receiptPdf.render).not.toHaveBeenCalled();
  });

  it("an unlinked learner opens nothing, whatever receipt id is named", async () => {
    const h = harness({ owns: {} });
    await expect(h.service.pdf("ac-unlinked", "r-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(h.receiptPdf.render).not.toHaveBeenCalled();
  });
});

describe("the QR address fallback", () => {
  it.each([
    ["https://erp.school.example/api/v1", "https://erp.school.example"],
    ["https://erp.school.example:8443/api/v1/", "https://erp.school.example:8443"],
    ["http://10.0.0.5:3000/api/v1", "http://10.0.0.5:3000"],
    ["not a url", null],
    ["", null],
    [null, null],
  ])("%s -> %s", (registered, expected) => {
    expect(webOriginOf(registered as string | null)).toBe(expected);
  });

  it("the PDF is made with the ERP's registered public origin as the fallback for the QR code", async () => {
    const h = harness({ registeredBaseUrl: "https://erp.klickiteducation.com/api/v1" });
    await h.service.pdf(LEARNER, "r-1");
    expect(h.receiptPdf.render).toHaveBeenCalledWith("r-1", { fallbackWebUrl: "https://erp.klickiteducation.com" });
  });

  it("with no registered address there is no fallback (and the PDF is still made)", async () => {
    const h = harness({ registeredBaseUrl: null });
    await h.service.pdf(LEARNER, "r-1");
    expect(h.receiptPdf.render).toHaveBeenCalledWith("r-1", { fallbackWebUrl: null });
  });

  it("readiness is asked with the same fallback", async () => {
    const h = harness();
    expect(await h.service.readiness()).toEqual({ canIssue: true, complete: true, issues: [] });
    expect(h.receiptPdf.readiness).toHaveBeenCalledWith({ fallbackWebUrl: "https://erp.school.example" });
  });
});
