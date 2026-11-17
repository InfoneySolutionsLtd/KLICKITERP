import { Body, Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../platform/auth";
import { AccountNotificationAck, KcbIpnService, PaymentValidationResponse, TillNotificationAck } from "../application/kcb-ipn.service";

/**
 * The addresses KCB BUNI's Instant Payment Notification API calls on us when money reaches the school's KCB account.
 * Give KCB these two full URLs (the host is the public address of this API, behind the `/api/v1` prefix):
 *
 *   POST {public-api}/api/v1/callbacks/kcb/ipn/account-notification   (deposits / transfers into the account)
 *   POST {public-api}/api/v1/callbacks/kcb/ipn/till-notification      (Paybill / Lipa na KCB till payments)
 *   POST {public-api}/api/v1/callbacks/kcb/ipn/validation             (optional: "is this reference real?")
 *
 * **Why these are `@Public()`**: KCB cannot hold one of this system's bearer tokens, so a JWT guard is not an
 * option. The protection is KCB's `Signature` header — a SHA256withRSA signature of the body made with KCB's private
 * key, checked against KCB's public key in `KcbIpnService` before anything is read or stored. (Restricting these two
 * paths to KCB's source addresses at the reverse proxy is a sensible extra layer, as for the Daraja callbacks.)
 *
 * The signature is over the exact bytes KCB sent, so the handlers receive the raw request body too — the API is
 * started with `rawBody: true` for this (`apps/api/src/main.api.ts`).
 */
@ApiTags("payments-kcb-ipn")
@Controller("callbacks/kcb/ipn")
export class KcbIpnController {
  constructor(private readonly kcbIpnService: KcbIpnService) {}

  @Post("account-notification")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "KCB BUNI account Instant Payment Notification (unauthenticated JWT-wise — verified by KCB's Signature header)" })
  @ApiBody({ schema: { type: "object" } })
  async accountNotification(
    @Req() req: RawBodyRequest<unknown>,
    @Body() body: unknown,
    @Headers("signature") signature: string | undefined,
  ): Promise<AccountNotificationAck> {
    return this.kcbIpnService.handleAccountNotification({ rawBody: req.rawBody, body, signature });
  }

  @Post("till-notification")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "KCB BUNI Paybill/till Instant Payment Notification (unauthenticated JWT-wise — verified by KCB's Signature header)" })
  @ApiBody({ schema: { type: "object" } })
  async tillNotification(
    @Req() req: RawBodyRequest<unknown>,
    @Body() body: unknown,
    @Headers("signature") signature: string | undefined,
  ): Promise<TillNotificationAck> {
    return this.kcbIpnService.handleTillNotification({ rawBody: req.rawBody, body, signature });
  }

  @Post("validation")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "KCB BUNI payment-reference validation (optional leg; answers a student's name, so it needs KCB to authenticate)" })
  @ApiBody({ schema: { type: "object" } })
  async validation(
    @Req() req: RawBodyRequest<unknown>,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<PaymentValidationResponse> {
    const signature = headers.signature;
    return this.kcbIpnService.handleValidation({
      rawBody: req.rawBody,
      body,
      signature: Array.isArray(signature) ? signature[0] : signature,
      headers,
    });
  }
}
