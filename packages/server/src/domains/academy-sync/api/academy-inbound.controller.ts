import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../shared/rbac/public.decorator";
import { AcademyPaymentRequestService } from "../application/academy-payment-request.service";
import { AcademyInboundGuard } from "./academy-inbound.guard";
import { AcademyPaymentRequestViewDto, CreateAcademyPaymentRequestDto } from "./dto/academy-payment-request.dto";

/**
 * Where the Klickit Academy calls this ERP. Every route here is `@Public()` (no user token) and protected instead by
 * `AcademyInboundGuard` — a per-school HMAC signature with replay protection (`academy-signature.ts`).
 *
 * `ping` lets the Academy (and the admin's "Test connection") prove the whole path works — the address is reachable, the
 * secret matches, the clocks agree. `payment-requests` is how a parent pays from the Academy portal: the Academy asks for
 * an M-Pesa prompt for a learner it already verified belongs to the signed-in parent, and later asks how it went. Receipt
 * downloads arrive here in a later step.
 */
@ApiTags("academy-inbound")
@Controller("academy/inbound")
export class AcademyInboundController {
  constructor(private readonly paymentRequests: AcademyPaymentRequestService) {}

  @Get("ping")
  @Public()
  @UseGuards(AcademyInboundGuard)
  @ApiHeader({ name: "X-Klickit-Signature", required: true, description: "v1=<hex HMAC-SHA256>, see academy-signature.ts" })
  @ApiOperation({ summary: "Academy -> ERP: signed reachability check" })
  ping(): { ok: true; product: string; serverTime: string } {
    return { ok: true, product: "klickit-erp", serverTime: new Date().toISOString() };
  }

  @Post("payment-requests")
  @HttpCode(200)
  @Public()
  @UseGuards(AcademyInboundGuard)
  @ApiHeader({ name: "X-Klickit-Signature", required: true, description: "v1=<hex HMAC-SHA256>, see academy-signature.ts" })
  @ApiOperation({
    summary:
      "Academy -> ERP: send the parent an M-Pesa prompt to pay a learner's fees. Idempotent on `requestId`; a request that cannot go ahead " +
      "(nothing owing, too much, M-Pesa not set up...) is answered with status FAILED and a parent-safe message, and nothing is sent.",
  })
  @ApiOkResponse({ type: AcademyPaymentRequestViewDto })
  createPaymentRequest(@Body() dto: CreateAcademyPaymentRequestDto): Promise<AcademyPaymentRequestViewDto> {
    return this.paymentRequests.create(dto);
  }

  @Get("payment-requests/:requestId")
  @Public()
  @UseGuards(AcademyInboundGuard)
  @ApiHeader({ name: "X-Klickit-Signature", required: true, description: "v1=<hex HMAC-SHA256>, see academy-signature.ts" })
  @ApiOperation({ summary: "Academy -> ERP: how is this payment going? (PENDING | PAID with the receipt number | FAILED | TIMED_OUT)" })
  @ApiOkResponse({ type: AcademyPaymentRequestViewDto })
  getPaymentRequest(@Param("requestId", ParseUUIDPipe) requestId: string): Promise<AcademyPaymentRequestViewDto> {
    return this.paymentRequests.getStatus(requestId);
  }
}
