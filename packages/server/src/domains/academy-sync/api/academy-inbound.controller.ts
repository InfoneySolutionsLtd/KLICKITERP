import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../shared/rbac/public.decorator";
import { AcademyParentInvoiceService } from "../application/academy-parent-invoice.service";
import { AcademyPaymentRequestService } from "../application/academy-payment-request.service";
import { AcademyReceiptService, DEFAULT_RECEIPTS_PER_ANSWER } from "../application/academy-receipt.service";
import { AcademyInboundGuard } from "./academy-inbound.guard";
import { AcademyParentFeeOptionsDto, AcademyParentInvoiceRequestViewDto, CreateAcademyParentInvoiceRequestDto } from "./dto/academy-parent-invoice.dto";
import { AcademyPaymentRequestViewDto, CreateAcademyPaymentRequestDto } from "./dto/academy-payment-request.dto";
import { AcademyReceiptListDto } from "./dto/academy-receipt.dto";

/**
 * Where the Klickit Academy calls this ERP. Every route here is `@Public()` (no user token) and protected instead by
 * `AcademyInboundGuard` — a per-school HMAC signature with replay protection (`academy-signature.ts`).
 *
 * `ping` lets the Academy (and the admin's "Test connection") prove the whole path works — the address is reachable, the
 * secret matches, the clocks agree. `payment-requests` is how a parent pays from the Academy portal: the Academy asks for
 * an M-Pesa prompt for a learner it already verified belongs to the signed-in parent, and later asks how it went.
 * `students/:id/receipts` lists a learner's receipts and `.../:receiptId/pdf` prints one; both are read from the books on every call
 * and a receipt is only ever found THROUGH its learner (the Academy names a learner it has verified is the parent's own child).
 * `students/:id/fee-options` and `students/:id/invoice-requests` let a parent customise and generate their own fee invoice: what
 * they may pick is decided in the books every time (only fee items the school marked optional, and transport), nothing is
 * created unless the school switched it on, and a repeated request never creates a second invoice.
 */
@ApiTags("academy-inbound")
@Controller("academy/inbound")
export class AcademyInboundController {
  constructor(
    private readonly paymentRequests: AcademyPaymentRequestService,
    private readonly receipts: AcademyReceiptService,
    private readonly parentInvoices: AcademyParentInvoiceService,
  ) {}

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

  @Get("students/:academyStudentId/fee-options")
  @Public()
  @UseGuards(AcademyInboundGuard)
  @ApiHeader({ name: "X-Klickit-Signature", required: true, description: "v1=<hex HMAC-SHA256>, see academy-signature.ts" })
  @ApiOperation({
    summary:
      "Academy -> ERP: what may a parent add to this learner's invoice? Per term of the current year: the optional fee items and transport routes on offer, " +
      "or `available: false` when the school has not switched parent invoicing on. 404 for a learner this ERP has not linked. " +
      "The Academy only ever asks about a learner it has verified is the signed-in parent's own child.",
  })
  @ApiOkResponse({ type: AcademyParentFeeOptionsDto })
  feeOptions(@Param("academyStudentId") academyStudentId: string): Promise<AcademyParentFeeOptionsDto> {
    return this.parentInvoices.options(academyStudentId);
  }

  @Post("students/:academyStudentId/invoice-requests")
  @HttpCode(200)
  @Public()
  @UseGuards(AcademyInboundGuard)
  @ApiHeader({ name: "X-Klickit-Signature", required: true, description: "v1=<hex HMAC-SHA256>, see academy-signature.ts" })
  @ApiOperation({
    summary:
      "Academy -> ERP: generate the invoice(s) a parent customised for their learner (the term's fee invoice, or a top-up of optional items, plus a transport invoice). " +
      "Idempotent on `requestId`. A request that cannot go ahead is answered with status REFUSED and a parent-safe message, and nothing is created.",
  })
  @ApiOkResponse({ type: AcademyParentInvoiceRequestViewDto })
  createInvoiceRequest(
    @Param("academyStudentId") academyStudentId: string,
    @Body() dto: CreateAcademyParentInvoiceRequestDto,
  ): Promise<AcademyParentInvoiceRequestViewDto> {
    return this.parentInvoices.create({ ...dto, academyStudentId });
  }

  @Get("invoice-requests/:requestId")
  @Public()
  @UseGuards(AcademyInboundGuard)
  @ApiHeader({ name: "X-Klickit-Signature", required: true, description: "v1=<hex HMAC-SHA256>, see academy-signature.ts" })
  @ApiOperation({ summary: "Academy -> ERP: how did this invoice request go? (CREATED with the invoices | REFUSED | PENDING)" })
  @ApiOkResponse({ type: AcademyParentInvoiceRequestViewDto })
  getInvoiceRequest(@Param("requestId", ParseUUIDPipe) requestId: string): Promise<AcademyParentInvoiceRequestViewDto> {
    return this.parentInvoices.getStatus(requestId);
  }

  @Get("students/:academyStudentId/receipts")
  @Public()
  @UseGuards(AcademyInboundGuard)
  @ApiHeader({ name: "X-Klickit-Signature", required: true, description: "v1=<hex HMAC-SHA256>, see academy-signature.ts" })
  @ApiOperation({
    summary:
      "Academy -> ERP: a learner's receipts, newest first (read from the books on every call). 404 for a learner this ERP has not linked. " +
      "The Academy only ever asks about a learner it has verified is the signed-in parent's own child.",
  })
  @ApiOkResponse({ type: AcademyReceiptListDto })
  listReceipts(
    @Param("academyStudentId") academyStudentId: string,
    @Query("limit", new DefaultValuePipe(DEFAULT_RECEIPTS_PER_ANSWER), ParseIntPipe) limit: number,
  ): Promise<AcademyReceiptListDto> {
    return this.receipts.list(academyStudentId, limit);
  }

  @Get("students/:academyStudentId/receipts/:receiptId/pdf")
  @Public()
  @UseGuards(AcademyInboundGuard)
  @ApiHeader({ name: "X-Klickit-Signature", required: true, description: "v1=<hex HMAC-SHA256>, see academy-signature.ts" })
  @ApiOperation({
    summary:
      "Academy -> ERP: one receipt as a PDF (school letterhead, the receipt as the books hold it, verification QR). 404 unless the receipt belongs " +
      "to THIS learner: a receipt is only ever found through its learner.",
  })
  @ApiProduces("application/pdf")
  async receiptPdf(
    @Param("academyStudentId") academyStudentId: string,
    @Param("receiptId", ParseUUIDPipe) receiptId: string,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ): Promise<StreamableFile> {
    const { filename, buffer } = await this.receipts.pdf(academyStudentId, receiptId);
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" });
    return new StreamableFile(buffer);
  }
}
