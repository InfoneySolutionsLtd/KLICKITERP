import { Money } from "../../../../shared/money/money";
import { KcbBuniApiClient, KcbBuniApiError, describeKcbFailure } from "../../../../shared/integrations/kcb-buni/kcb-buni-api.client";
import { KcbBuniConfig } from "../../../../shared/integrations/kcb-buni/kcb-buni.config";
import {
  MpesaB2cPaymentInput,
  MpesaB2cPaymentResult,
  MpesaPort,
  MpesaStkPushInput,
  MpesaStkPushResult,
  MpesaStkStatusResult,
} from "../ports/mpesa.port";

/** KCB's M-Pesa Express path on the API gateway (API definition `MpesaExpressAPIService` 1.0.0, `POST /stkpush`). */
const STK_PUSH_PATH = "/mm/api/request/1.0.0/stkpush";
/** The Express definition limits the description to 13 characters. */
const MAX_DESCRIPTION_LENGTH = 13;

/**
 * `MpesaPort` over KCB BUNI's M-Pesa Express API — the school's STK push, but collected through its KCB till /
 * account instead of a Safaricom Daraja shortcode of its own. Money lands in the school's KCB account, which then
 * announces it on the Instant Payment Notification channel (`KcbIpnService`).
 *
 * What the KCB API does and does not offer, from its published definition:
 *  - it takes ONE request, `POST /stkpush`, answers with the usual `CheckoutRequestID` / `MerchantRequestID`, and
 *    reports the customer's decision on the `callbackUrl` we give it — we point that at the existing
 *    `POST /callbacks/mpesa/stk` handler (`MpesaService.handleStkCallback`);
 *  - it has NO status-query call and NO payout call. `queryStkStatus` / `b2cPayment` therefore say so plainly
 *    instead of pretending; `supportsStatusQuery` lets `MpesaService` explain that to the user.
 *
 * Amounts must be whole shillings ("decimal values are not permitted"). A fractional amount is REFUSED, not rounded:
 * silently turning KES 1,000.50 into 1,001 would charge a parent more than they owe.
 */
export class KcbMpesaExpressAdapter implements MpesaPort {
  readonly supportsStatusQuery = false;

  constructor(
    private readonly config: Pick<KcbBuniConfig, "stkAccountNumber" | "callbackBaseUrl">,
    private readonly client: Pick<KcbBuniApiClient, "postJson">,
  ) {}

  async stkPush(input: MpesaStkPushInput): Promise<MpesaStkPushResult> {
    const { stkAccountNumber, callbackBaseUrl } = this.config;
    if (!stkAccountNumber) {
      throw new KcbBuniApiError("KCB M-Pesa Express needs the school's KCB till/account number (stkAccountNumber) in the KCB integration settings");
    }
    if (!callbackBaseUrl) {
      throw new KcbBuniApiError("KCB M-Pesa Express needs this API's public address (callbackBaseUrl) in the KCB integration settings, so KCB can report the result");
    }

    const response = await this.client.postJson(STK_PUSH_PATH, {
      phoneNumber: input.msisdn,
      amount: wholeShillings(input.amountKes),
      // KCB's format: "<till or account number>-<our own reference>".
      invoiceNumber: `${stkAccountNumber}-${input.accountRef}`,
      callbackUrl: `${callbackBaseUrl}/callbacks/mpesa/stk`,
      transactionDescription: (input.transactionDesc ?? "School fees").slice(0, MAX_DESCRIPTION_LENGTH),
    });

    const header = asRecord(response.json?.header);
    const body = asRecord(response.json?.response);
    const accepted = response.status >= 200 && response.status < 300 && String(header?.statusCode) === "0";
    const checkoutRequestId = typeof body?.CheckoutRequestID === "string" ? body.CheckoutRequestID : undefined;
    const merchantRequestId = typeof body?.MerchantRequestID === "string" ? body.MerchantRequestID : undefined;

    if (!accepted || !checkoutRequestId || !merchantRequestId) {
      throw new KcbBuniApiError(
        `KCB M-Pesa Express did not accept the request: ${describeKcbFailure(response)}`,
        response.status,
        header?.statusCode === undefined ? undefined : String(header.statusCode),
      );
    }
    return { checkoutRequestId, merchantRequestId };
  }

  queryStkStatus(_checkoutRequestId: string): Promise<MpesaStkStatusResult> {
    return Promise.reject(new KcbBuniApiError("KCB M-Pesa Express has no status-query: the customer's decision arrives on the callback"));
  }

  b2cPayment(_input: MpesaB2cPaymentInput): Promise<MpesaB2cPaymentResult> {
    return Promise.reject(new KcbBuniApiError("KCB M-Pesa Express cannot send payouts — use Funds Transfer"));
  }
}

function wholeShillings(amount: Money): string {
  const text = amount.toDecimalString();
  const [whole, fraction = ""] = text.split(".");
  if (/[^0]/.test(fraction)) {
    throw new KcbBuniApiError(`KCB M-Pesa Express accepts whole shillings only; ${text} has cents — round the amount first`);
  }
  return whole;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}
