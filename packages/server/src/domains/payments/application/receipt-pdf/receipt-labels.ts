/**
 * How a receipt is WORDED for someone who is not the school's bursar — a parent reading the receipt list in the Academy portal
 * or the printed PDF. One place, so the list and the PDF can never describe the same receipt differently.
 */

/** How a payment method is worded. */
export const RECEIPT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK: "Bank deposit",
  CHEQUE: "Cheque",
  CARD: "Card",
  POS: "Card (POS)",
  MPESA_STK: "M-Pesa",
  MPESA_C2B: "M-Pesa",
  MPESA_TILL: "M-Pesa",
  WALLET: "School wallet",
  BANK_TRANSFER: "Bank transfer",
  CREDIT_BALANCE: "Credit on the account",
};

/** Methods whose external reference (the M-Pesa code, the bank's transaction reference) is the payer's own and worth showing. */
const REFERENCE_METHODS = new Set(["MPESA_STK", "MPESA_C2B", "MPESA_TILL", "BANK_TRANSFER"]);

export interface ReceiptMethodView {
  label: string;
  /** The M-Pesa code / bank reference, only for methods where it belongs to the payer; never a cheque or card detail. */
  reference: string | null;
}

export function describeReceiptMethod(method: string, externalRef: string | null | undefined): ReceiptMethodView {
  const reference = externalRef?.trim();
  return {
    label: RECEIPT_METHOD_LABELS[method] ?? method,
    reference: REFERENCE_METHODS.has(method) && reference ? reference : null,
  };
}

/** Where the money went: an invoice by its number, the account's advance credit, or (an allocation with no invoice) "School fees". */
export function describeReceiptAllocation(allocation: { toPrepayment: boolean; invoiceNumber: string | null }): string {
  if (allocation.toPrepayment) return "Advance payment (credit on the account)";
  return allocation.invoiceNumber ? `Invoice ${allocation.invoiceNumber}` : "School fees";
}
