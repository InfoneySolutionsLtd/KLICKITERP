import { Money } from "../../../shared/money/money";
import type { PaymentRequestStatusRow } from "../infrastructure/acad-payment-request.repository";

/** What a parent is told about their payment. Always read from the books (the M-Pesa transaction), never stored. */
export type PaymentOutcome = "PENDING" | "PAID" | "FAILED" | "TIMED_OUT";

export interface PaymentRequestView {
  requestId: string;
  status: PaymentOutcome;
  /** Decimal string, 4 places. */
  amount: string;
  currency: "KES";
  /** The ERP receipt number once the payment is received. */
  receiptNumber: string | null;
  /** A short machine code for a refusal/failure (the Academy may map it to its own wording). */
  code: string | null;
  /** Plain wording safe to show a parent. */
  message: string | null;
}

/** The biggest amount a single M-Pesa STK prompt can carry. */
export const MAX_PORTAL_PAYMENT_KES = 250_000;
/** A prompt this recent whose transaction is still open means "already waiting for the parent" — do not send a second one. */
export const WAITING_PROMPT_SECONDS = 180;
/** A request that was accepted but never reached "sent" this long ago did not make it — say so instead of waiting forever. */
export const STALE_RECEIVED_SECONDS = 120;
/** An M-Pesa prompt unanswered for this long is reported as "no reply" (a late callback still turns it into PAID). */
export const PROMPT_REPLY_SECONDS = 300;

/**
 * Brings a Kenyan Safaricom/Airtel mobile number to the `2547XXXXXXXX` / `2541XXXXXXXX` form the STK push needs
 * (`0712345678`, `+254712345678`, `254712345678` and `712345678` all become `254712345678`). Anything that is not
 * recognisably a Kenyan mobile is `null` — a prompt must never be sent to a number we had to guess at.
 */
export function toStkMsisdn(raw: string): string | null {
  const compact = (raw ?? "").trim().replace(/[\s\-().]/g, "");
  const match = /^(?:\+?254|0)?([17]\d{8})$/.exec(compact);
  return match ? `254${match[1]}` : null;
}

/** M-Pesa takes whole shillings: the parent is charged exactly what was asked, never a rounded figure. */
export function isWholeShillings(amount: Money): boolean {
  return amount.toScaled() % 10n ** BigInt(Money.SCALE) === 0n;
}

export function sumMoney(amounts: Money[]): Money {
  return amounts.reduce((total, next) => total.add(next), Money.ZERO);
}

const SECOND_MS = 1000;

/**
 * The answer to "how is this payment going?", worked out fresh each time from the request and the M-Pesa transaction it
 * produced. A callback that arrives late simply changes the answer on the next call; nothing here is ever "stuck".
 */
export function deriveView(row: PaymentRequestStatusRow, now: Date): PaymentRequestView {
  const base = { requestId: row.academyRequestId, amount: row.amount, currency: "KES" as const, receiptNumber: null, code: null, message: null };

  if (row.requestStatus === "REFUSED") {
    return { ...base, status: "FAILED", code: row.refusalCode ?? "REFUSED", message: row.refusalMessage ?? "The payment could not be started." };
  }

  if (row.requestStatus === "RECEIVED") {
    const ageSeconds = (now.getTime() - row.requestCreatedAt.getTime()) / SECOND_MS;
    return ageSeconds > STALE_RECEIVED_SECONDS
      ? { ...base, status: "FAILED", code: "NOT_SENT", message: "The payment request could not be sent. Please try again." }
      : { ...base, status: "PENDING", message: "Sending the M-Pesa request to your phone…" };
  }

  switch (row.transactionState) {
    case "CONFIRMED":
      return { ...base, status: "PAID", receiptNumber: row.receiptNumber, message: "Payment received. Thank you." };
    case "FAILED":
      return { ...base, status: "FAILED", code: "NOT_COMPLETED", message: "The payment was not completed on your phone." };
    case "REVERSED":
      return { ...base, status: "FAILED", code: "REVERSED", message: "This payment was reversed by the school." };
    case "TIMEOUT":
      return { ...base, status: "TIMED_OUT", code: "NO_REPLY", message: NO_REPLY_MESSAGE };
    default: {
      // INITIATED / PENDING (or, defensively, no transaction at all): still waiting for the parent.
      const startedAt = row.requestCreatedAt.getTime();
      const waitedSeconds = (now.getTime() - startedAt) / SECOND_MS;
      return waitedSeconds > PROMPT_REPLY_SECONDS
        ? { ...base, status: "TIMED_OUT", code: "NO_REPLY", message: NO_REPLY_MESSAGE }
        : { ...base, status: "PENDING", message: "Check your phone and enter your M-Pesa PIN to finish paying." };
    }
  }
}

const NO_REPLY_MESSAGE =
  "We have not heard back from M-Pesa. If money was taken from your account it will still be received and shown here automatically.";
