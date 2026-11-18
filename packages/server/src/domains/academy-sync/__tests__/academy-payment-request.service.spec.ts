/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { MpesaLogOnlyAdapter } from "../../payments";
import { AcademyPaymentRequestService } from "../application/academy-payment-request.service";
import type { PaymentRequestRow, PaymentRequestStatusRow } from "../infrastructure/acad-payment-request.repository";

// The transaction helper only needs to hand the callback an entity manager.
const EM = { tag: "em" };
jest.mock("../../../shared/database/tx", () => ({ runInTransaction: async (_ds: unknown, fn: (em: unknown) => unknown) => fn(EM) }));

const REQ = "11111111-1111-4111-8111-111111111111";
const STUDENT = "ac-student-1";
const INV_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INV_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

interface Over {
  link?: { studentId: string; admissionNo: string } | null;
  invoices?: Array<{ id: string; balance: string }>;
  waiting?: boolean;
  actor?: string | null;
  provider?: unknown;
  existing?: PaymentRequestRow | null;
  stkError?: Error;
  statusRow?: Partial<PaymentRequestStatusRow> | null;
}

function harness(over: Over = {}) {
  const calls: { refused: any[]; sent: any[]; inserted: any[] } = { refused: [], sent: [], inserted: [] };
  const statusRow = (): PaymentRequestStatusRow | null => {
    if (over.statusRow === null) return null;
    const refusal = calls.refused[0];
    const sent = calls.sent[0];
    return {
      academyRequestId: REQ,
      amount: "2500.0000",
      requestStatus: refusal ? "REFUSED" : sent ? "SENT" : "RECEIVED",
      refusalCode: refusal?.code ?? null,
      refusalMessage: refusal?.message ?? null,
      requestCreatedAt: new Date(),
      transactionState: sent ? "PENDING" : null,
      transactionUpdatedAt: new Date(),
      receiptNumber: null,
      ...over.statusRow,
    };
  };
  const repository = {
    insertReceived: jest.fn(async (input: any) => {
      calls.inserted.push(input);
      if (over.existing) return { inserted: false, row: over.existing };
      return {
        inserted: true,
        row: { id: "row-1", academyRequestId: input.academyRequestId, academyStudentId: input.academyStudentId, studentId: null, amount: input.amount, status: "RECEIVED", refusalCode: null, refusalMessage: null, mpesaTransactionId: null, invoiceIds: input.invoiceIds } as PaymentRequestRow,
      };
    }),
    findStudentLink: jest.fn(async () => (over.link === undefined ? { studentId: "erp-student-1", admissionNo: "ADM-1001" } : over.link)),
    findPayableInvoices: jest.fn(async () => over.invoices ?? [{ id: INV_A, balance: "10000.0000" }]),
    hasWaitingPrompt: jest.fn(async () => over.waiting ?? false),
    markRefused: jest.fn(async (_id: string, code: string, message: string, studentId: string | null) => void calls.refused.push({ code, message, studentId })),
    markSent: jest.fn(async (id: string, studentId: string, txnId: string, em: unknown) => void calls.sent.push({ id, studentId, txnId, em })),
    findStatusRow: jest.fn(async () => statusRow()),
  };
  const mpesaService = {
    initiateStk: jest.fn(async () => {
      if (over.stkError) throw over.stkError;
      return { id: "txn-1" };
    }),
  };
  const adapterResolver = { resolve: jest.fn(async () => over.provider ?? { stkPush: jest.fn() }) };
  const settings = { getTyped: jest.fn(async () => (over.actor === undefined ? "cashier-user-1" : over.actor)) };
  const service = new AcademyPaymentRequestService(repository as any, mpesaService as any, adapterResolver as any, settings as any, {} as any);
  return { service, repository, mpesaService, adapterResolver, settings, calls };
}

const input = (over: Record<string, unknown> = {}) => ({ requestId: REQ, academyStudentId: STUDENT, amount: "2500", phone: "0712 345 678", ...over }) as any;

describe("AcademyPaymentRequestService.create — the happy path", () => {
  it("sends ONE M-Pesa prompt for the learner, with the admission number as the account, and links it to the request", async () => {
    const h = harness();
    const view = await h.service.create(input());

    expect(h.mpesaService.initiateStk).toHaveBeenCalledTimes(1);
    const [em, stk, actor] = h.mpesaService.initiateStk.mock.calls[0] as any[];
    expect(em).toBe(EM);
    expect(stk.studentId).toBe("erp-student-1");
    expect(stk.msisdn).toBe("254712345678");
    expect(stk.accountRef).toBe("ADM-1001");
    expect(stk.amountKes.toDecimalString()).toBe("2500.0000");
    expect(stk.invoiceIds).toBeUndefined(); // not directed: the receipt allocates oldest first, as for any other STK
    expect(actor).toBe("cashier-user-1");

    expect(h.calls.sent).toEqual([{ id: "row-1", studentId: "erp-student-1", txnId: "txn-1", em: EM }]); // same transaction as the push
    expect(view).toMatchObject({ requestId: REQ, status: "PENDING", currency: "KES" });
    expect(h.calls.refused).toHaveLength(0);
  });

  it("directs the receipt at the chosen invoices when the parent chose some", async () => {
    const h = harness({ invoices: [{ id: INV_A, balance: "1000.0000" }, { id: INV_B, balance: "2000.0000" }] });
    await h.service.create(input({ invoiceIds: [INV_A, INV_B] }));
    expect((h.mpesaService.initiateStk.mock.calls[0] as any[])[1].invoiceIds).toEqual([INV_A, INV_B]);
    expect(h.repository.findPayableInvoices).toHaveBeenCalledWith("erp-student-1", [INV_A, INV_B]);
  });

  it("can pay exactly what is owing, and part of it", async () => {
    const full = harness({ invoices: [{ id: INV_A, balance: "2500.0000" }] });
    await full.service.create(input({ amount: "2500" }));
    expect(full.mpesaService.initiateStk).toHaveBeenCalledTimes(1);

    const part = harness({ invoices: [{ id: INV_A, balance: "2500.0000" }] });
    await part.service.create(input({ amount: "100" }));
    expect(part.mpesaService.initiateStk).toHaveBeenCalledTimes(1);
  });

  it("limits the cap to the balances of the CHOSEN invoices, summed exactly", async () => {
    const h = harness({ invoices: [{ id: INV_A, balance: "1000.1000" }, { id: INV_B, balance: "1000.2000" }] });
    await h.service.create(input({ amount: "2000", invoiceIds: [INV_A, INV_B] })); // 2000.3000 owing -> fine
    expect(h.mpesaService.initiateStk).toHaveBeenCalledTimes(1);
  });
});

describe("AcademyPaymentRequestService.create — the same request twice never sends a second prompt", () => {
  it("replays the existing request's outcome and does nothing else", async () => {
    const existing = { id: "row-0", academyRequestId: REQ, academyStudentId: STUDENT, studentId: "erp-student-1", amount: "2500.0000", status: "SENT", refusalCode: null, refusalMessage: null, mpesaTransactionId: "txn-0", invoiceIds: null } as PaymentRequestRow;
    const h = harness({ existing });
    const view = await h.service.create(input());
    expect(view.requestId).toBe(REQ);
    expect(h.mpesaService.initiateStk).not.toHaveBeenCalled();
    expect(h.repository.findStudentLink).not.toHaveBeenCalled();
    expect(h.repository.markSent).not.toHaveBeenCalled();
  });

  it("refuses the same request id reused for a different amount or learner (a bug or tampering on the caller's side)", async () => {
    const existing = { id: "row-0", academyRequestId: REQ, academyStudentId: STUDENT, studentId: null, amount: "2500.0000", status: "SENT" } as PaymentRequestRow;
    await expect(harness({ existing }).service.create(input({ amount: "9000" }))).rejects.toBeInstanceOf(ConflictException);
    await expect(harness({ existing }).service.create(input({ academyStudentId: "someone-else" }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("an existing refusal is replayed as the same refusal", async () => {
    const existing = { id: "row-0", academyRequestId: REQ, academyStudentId: STUDENT, studentId: null, amount: "2500.0000", status: "REFUSED" } as PaymentRequestRow;
    const h = harness({ existing, statusRow: { requestStatus: "REFUSED", refusalCode: "AMOUNT_TOO_HIGH", refusalMessage: "too much", transactionState: null } });
    expect(await h.service.create(input())).toMatchObject({ status: "FAILED", code: "AMOUNT_TOO_HIGH" });
    expect(h.mpesaService.initiateStk).not.toHaveBeenCalled();
  });
});

describe("AcademyPaymentRequestService.create — nothing is sent unless every check passes", () => {
  const refused = async (h: ReturnType<typeof harness>, code: string, over: Record<string, unknown> = {}) => {
    const view = await h.service.create(input(over));
    expect(h.mpesaService.initiateStk).not.toHaveBeenCalled();
    expect(h.calls.sent).toHaveLength(0);
    expect(h.calls.refused[0].code).toBe(code);
    expect(view).toMatchObject({ status: "FAILED", code });
    expect(view.message).toBeTruthy();
  };

  it("a learner this ERP has not linked", async () => {
    const h = harness({ link: null });
    await refused(h, "STUDENT_NOT_LINKED");
    expect(h.repository.findPayableInvoices).not.toHaveBeenCalled();
    expect(h.calls.refused[0].studentId).toBeNull();
  });

  it("nothing owing", async () => {
    await refused(harness({ invoices: [] }), "NOTHING_TO_PAY");
  });

  it("an invoice that is not the learner's, or not payable (fewer found than asked for)", async () => {
    await refused(harness({ invoices: [{ id: INV_A, balance: "1000.0000" }] }), "INVOICE_NOT_PAYABLE", { invoiceIds: [INV_A, INV_B] });
  });

  it("more than is owing — by even a cent", async () => {
    await refused(harness({ invoices: [{ id: INV_A, balance: "2499.9999" }] }), "AMOUNT_TOO_HIGH");
  });

  it("more than the CHOSEN invoices owe, even though the learner owes more overall", async () => {
    // only INV_A is chosen, so only its balance counts — the repository filters by the chosen ids
    await refused(harness({ invoices: [{ id: INV_A, balance: "1000.0000" }] }), "AMOUNT_TOO_HIGH", { invoiceIds: [INV_A] });
  });

  it("a prompt for this learner is already waiting on a phone", async () => {
    await refused(harness({ waiting: true }), "ALREADY_WAITING");
  });

  it("no system cashier is configured", async () => {
    await refused(harness({ actor: null }), "NOT_CONFIGURED");
  });

  it("no real M-Pesa provider is set up (the log-only fallback would 'send' nothing)", async () => {
    await refused(harness({ provider: new MpesaLogOnlyAdapter() }), "NOT_CONFIGURED");
  });

  it("the M-Pesa provider fails: refused with a safe message, and the provider's own error text never reaches the parent", async () => {
    const h = harness({ stkError: new Error("Daraja 500: invalid consumer key abc123") });
    const view = await h.service.create(input());
    expect(h.calls.sent).toHaveLength(0);
    expect(h.calls.refused[0]).toMatchObject({ code: "PROVIDER_ERROR", studentId: "erp-student-1" });
    expect(view.status).toBe("FAILED");
    expect(JSON.stringify(view)).not.toMatch(/Daraja|abc123|consumer key/i);
  });
});

describe("AcademyPaymentRequestService.create — malformed requests are rejected before anything is recorded", () => {
  const rejected = async (over: Record<string, unknown>) => {
    const h = harness();
    await expect(h.service.create(input(over))).rejects.toBeInstanceOf(ValidationException);
    expect(h.repository.insertReceived).not.toHaveBeenCalled();
    expect(h.mpesaService.initiateStk).not.toHaveBeenCalled();
  };

  it("a phone number that is not a Kenyan mobile", async () => rejected({ phone: "12345" }));
  it("a zero amount", async () => rejected({ amount: "0" }));
  it("an amount with cents (the parent is charged exactly what they saw)", async () => rejected({ amount: "2500.50" }));
  it("more than one M-Pesa prompt can carry", async () => rejected({ amount: "250001" }));

  it("exactly the M-Pesa limit is allowed", async () => {
    const h = harness({ invoices: [{ id: INV_A, balance: "300000.0000" }] });
    await h.service.create(input({ amount: "250000" }));
    expect(h.mpesaService.initiateStk).toHaveBeenCalledTimes(1);
  });

  it("records the phone only masked", async () => {
    const h = harness();
    await h.service.create(input());
    expect(h.calls.inserted[0].msisdnMasked).toBe("254******678");
    expect(JSON.stringify(h.calls.inserted[0])).not.toContain("254712345678");
  });
});

describe("AcademyPaymentRequestService.getStatus", () => {
  it("reports on a request", async () => {
    const h = harness({ statusRow: { requestStatus: "SENT", transactionState: "CONFIRMED", receiptNumber: "RCP-000042" } });
    expect(await h.service.getStatus(REQ)).toMatchObject({ status: "PAID", receiptNumber: "RCP-000042" });
  });

  it("is a not-found for a request this ERP never had (no hint about anything else)", async () => {
    await expect(harness({ statusRow: null }).service.getStatus(REQ)).rejects.toBeInstanceOf(NotFoundException);
  });
});
