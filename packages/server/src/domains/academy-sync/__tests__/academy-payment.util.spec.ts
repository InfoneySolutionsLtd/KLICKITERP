import { Money } from "../../../shared/money/money";
import { deriveView, isWholeShillings, sumMoney, toStkMsisdn } from "../application/academy-payment.util";
import type { PaymentRequestStatusRow } from "../infrastructure/acad-payment-request.repository";

describe("toStkMsisdn", () => {
  it.each([
    ["0712345678", "254712345678"],
    ["0112345678", "254112345678"],
    ["+254712345678", "254712345678"],
    ["254712345678", "254712345678"],
    ["712345678", "254712345678"],
    ["  0712 345-678 ", "254712345678"],
    ["(0712) 345 678", "254712345678"],
  ])("%s -> %s", (input, expected) => {
    expect(toStkMsisdn(input)).toBe(expected);
  });

  it.each([
    "", "abc", "07123", "0812345678", "2548123456789", "+255712345678", "0712345678 9", "071234567890", "0712345678; DROP TABLE",
  ])("%j is not a Kenyan mobile number, so no prompt is ever sent to it", (input) => {
    expect(toStkMsisdn(input)).toBeNull();
  });
});

describe("isWholeShillings", () => {
  it.each([["2500", true], ["2500.0000", true], ["1", true], ["2500.5", false], ["2500.0001", false], ["0.5", false]])("%s -> %s", (value, expected) => {
    expect(isWholeShillings(Money.fromDecimalString(value))).toBe(expected);
  });
});

describe("sumMoney", () => {
  it("adds exactly (no floating point drift)", () => {
    const parts = ["0.1", "0.2", "0.3", "10000.0001"].map((v) => Money.fromDecimalString(v));
    expect(sumMoney(parts).toDecimalString()).toBe("10000.6001");
  });
  it("is zero for nothing", () => {
    expect(sumMoney([]).isZero()).toBe(true);
  });
});

describe("deriveView — what the parent is told, read from the books", () => {
  const NOW = new Date("2026-03-10T12:00:00Z");
  const secondsAgo = (n: number): Date => new Date(NOW.getTime() - n * 1000);
  const row = (over: Partial<PaymentRequestStatusRow> = {}): PaymentRequestStatusRow => ({
    academyRequestId: "req-1",
    amount: "2500.0000",
    requestStatus: "SENT",
    refusalCode: null,
    refusalMessage: null,
    requestCreatedAt: secondsAgo(20),
    transactionState: "PENDING",
    transactionUpdatedAt: secondsAgo(20),
    receiptNumber: null,
    ...over,
  });

  it("waiting for the parent while the M-Pesa transaction is open", () => {
    const view = deriveView(row(), NOW);
    expect(view.status).toBe("PENDING");
    expect(view.receiptNumber).toBeNull();
    expect(view.message).toMatch(/check your phone/i);
  });

  it("INITIATED is also waiting", () => {
    expect(deriveView(row({ transactionState: "INITIATED" }), NOW).status).toBe("PENDING");
  });

  it("PAID with the receipt number once the callback has been captured", () => {
    const view = deriveView(row({ transactionState: "CONFIRMED", receiptNumber: "RCP-000123" }), NOW);
    expect(view).toMatchObject({ status: "PAID", receiptNumber: "RCP-000123", amount: "2500.0000", currency: "KES" });
  });

  it("FAILED when the parent cancelled or the PIN was wrong", () => {
    expect(deriveView(row({ transactionState: "FAILED" }), NOW)).toMatchObject({ status: "FAILED", code: "NOT_COMPLETED" });
  });

  it("FAILED, plainly, when the school reversed it", () => {
    expect(deriveView(row({ transactionState: "REVERSED" }), NOW)).toMatchObject({ status: "FAILED", code: "REVERSED" });
  });

  it("TIMED_OUT when the transaction is marked timed out", () => {
    expect(deriveView(row({ transactionState: "TIMEOUT" }), NOW)).toMatchObject({ status: "TIMED_OUT", code: "NO_REPLY" });
  });

  it("TIMED_OUT when no reply has come for a long time — without claiming the money is lost", () => {
    const view = deriveView(row({ requestCreatedAt: secondsAgo(301) }), NOW);
    expect(view.status).toBe("TIMED_OUT");
    expect(view.message).toMatch(/still be received/i);
  });

  it("a late callback still turns a timed-out prompt into PAID (the answer is re-derived every time)", () => {
    const old = secondsAgo(900);
    expect(deriveView(row({ requestCreatedAt: old }), NOW).status).toBe("TIMED_OUT");
    expect(deriveView(row({ requestCreatedAt: old, transactionState: "CONFIRMED", receiptNumber: "RCP-9" }), NOW).status).toBe("PAID");
  });

  it("a refusal is FAILED with the recorded wording and code", () => {
    const view = deriveView(row({ requestStatus: "REFUSED", transactionState: null, refusalCode: "AMOUNT_TOO_HIGH", refusalMessage: "That is more than is owing." }), NOW);
    expect(view).toMatchObject({ status: "FAILED", code: "AMOUNT_TOO_HIGH", message: "That is more than is owing." });
  });

  it("an accepted request not yet sent is PENDING, then FAILED once it is clearly not going to be", () => {
    const received = row({ requestStatus: "RECEIVED", transactionState: null });
    expect(deriveView({ ...received, requestCreatedAt: secondsAgo(10) }, NOW).status).toBe("PENDING");
    expect(deriveView({ ...received, requestCreatedAt: secondsAgo(121) }, NOW)).toMatchObject({ status: "FAILED", code: "NOT_SENT" });
  });

  it("never invents a receipt number for anything but a confirmed payment", () => {
    for (const state of ["PENDING", "FAILED", "TIMEOUT", "REVERSED", "INITIATED"]) {
      expect(deriveView(row({ transactionState: state, receiptNumber: "RCP-SHOULD-NOT-SHOW" }), NOW).receiptNumber).toBeNull();
    }
  });
});
