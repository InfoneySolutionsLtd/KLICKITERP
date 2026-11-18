/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ReceiptVerificationService } from "../application/receipt-verification.service";
import { receiptVerificationInput } from "../application/receipts.service";

// The transaction helper only needs to hand the callback an entity manager.
const EM = { query: jest.fn() };
jest.mock("../../../shared/database/tx", () => ({ runInTransaction: async (_ds: unknown, fn: (em: unknown) => unknown) => fn(EM) }));

const RECEIPT = "00000000-0000-4000-8000-000000000001";
const ROW = { id: RECEIPT, number: "PAY-000042", payer_name: "Wanjiru Kamau", total: "2500.0000", receipt_date: "2026-03-10", reversal_of_id: null };

function harness(over: { existing?: Array<{ token: string } | null>; row?: any } = {}) {
  const lookups = [...(over.existing ?? [null, null])];
  const documentVerification = {
    findByDocument: jest.fn(async () => (lookups.length > 1 ? lookups.shift() : lookups[0]) ?? null),
    mint: jest.fn(async () => ({ token: "minted-token" })),
  };
  EM.query.mockReset();
  EM.query.mockImplementation(async (sql: string) => (/pg_advisory_xact_lock/.test(sql) ? [] : "row" in over ? (over.row ? [over.row] : []) : [ROW]));
  return { service: new ReceiptVerificationService({} as any, documentVerification as any), documentVerification };
}

describe("receiptVerificationInput — ONE definition of what a receipt's token records", () => {
  it("is the same whether the total comes as Money or as text", () => {
    const fromText = receiptVerificationInput({ id: RECEIPT, number: "PAY-1", payerName: "A", total: "10.0000", receiptDate: "2026-01-01" });
    const fromMoney = receiptVerificationInput({ id: RECEIPT, number: "PAY-1", payerName: "A", total: { toDecimalString: () => "10.0000" }, receiptDate: "2026-01-01" });
    expect(fromText).toEqual(fromMoney);
    expect(fromText).toEqual({
      documentType: "PAYMENT_RECEIPT",
      documentId: RECEIPT,
      documentRef: "PAY-1",
      summary: { payerName: "A", total: "10.0000", receiptDate: "2026-01-01", receiptNumber: "PAY-1" },
    });
  });
});

describe("ReceiptVerificationService.ensureToken — a receipt is never without a QR code", () => {
  it("returns the token a receipt already has, and touches nothing else", async () => {
    const h = harness({ existing: [{ token: "existing-token" }] });
    expect(await h.service.ensureToken(RECEIPT)).toEqual({ token: "existing-token" });
    expect(h.documentVerification.mint).not.toHaveBeenCalled();
    expect(EM.query).not.toHaveBeenCalled();
  });

  it("mints the missing token, with exactly the same content every other receipt's token has", async () => {
    const h = harness();
    expect(await h.service.ensureToken(RECEIPT)).toEqual({ token: "minted-token" });
    expect(h.documentVerification.mint).toHaveBeenCalledTimes(1);
    expect(h.documentVerification.mint).toHaveBeenCalledWith(
      EM,
      receiptVerificationInput({ id: RECEIPT, number: "PAY-000042", payerName: "Wanjiru Kamau", total: "2500.0000", receiptDate: "2026-03-10" }),
    );
  });

  it("serialises concurrent requests for the same receipt with an advisory lock, taken BEFORE it decides to mint", async () => {
    const h = harness();
    await h.service.ensureToken(RECEIPT);
    const lockCall = EM.query.mock.calls.findIndex(([sql]) => /pg_advisory_xact_lock/.test(sql));
    expect(lockCall).toBe(0);
    expect(EM.query.mock.calls[0][1]).toEqual([`docv:PAYMENT_RECEIPT:${RECEIPT}`]);
  });

  it("when another request minted it while this one waited for the lock, uses that token and mints nothing (never two tokens)", async () => {
    const h = harness({ existing: [null, { token: "won-the-race" }] });
    expect(await h.service.ensureToken(RECEIPT)).toEqual({ token: "won-the-race" });
    expect(h.documentVerification.mint).not.toHaveBeenCalled();
  });

  it("a reversal's contra-receipt, and a receipt that does not exist, are the same not-found (nothing minted)", async () => {
    const contra = harness({ row: { ...ROW, reversal_of_id: "some-original" } });
    await expect(contra.service.ensureToken(RECEIPT)).rejects.toBeInstanceOf(NotFoundException);
    expect(contra.documentVerification.mint).not.toHaveBeenCalled();
    const missing = harness({ row: null });
    await expect(missing.service.ensureToken(RECEIPT)).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.documentVerification.mint).not.toHaveBeenCalled();
  });
});
