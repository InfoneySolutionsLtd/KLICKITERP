import { Body, Controller, Get, Post, Put, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AcademyPublishService, PublishStatus } from "../application/academy-publish.service";
import { AcademyReceiptService } from "../application/academy-receipt.service";
import { AcademyPublishStatusDto, SetAcademyPublishDto } from "./dto/academy-publish.dto";
import { AuthenticatedRequest } from "./request-context";

function toDto(status: PublishStatus, receiptSetup: AcademyPublishStatusDto["receiptSetup"]): AcademyPublishStatusDto {
  return {
    connected: status.connected,
    enabled: status.enabled,
    pending: status.pending,
    published: status.published,
    rejected: status.rejected,
    lastPublishAt: status.lastPublishAt?.toISOString() ?? null,
    lastPublishOk: status.lastPublishOk,
    lastPublishMessage: status.lastPublishMessage,
    recentRejections: status.recentRejections.map((r) => ({ invoiceNumber: r.invoiceNumber, reason: r.reason, at: r.at?.toISOString() ?? null })),
    receiptSetup,
  };
}

/** How many batches of 100 a manual "Publish now" sends before answering; the scheduled sweep carries on with any backlog. */
const MANUAL_RUN_BATCHES = 3;

/**
 * Staff side of publishing invoices to the Academy parent portal: see what is in sync, switch publishing on or off, and
 * push what is waiting right now.
 */
@ApiTags("academy-sync")
@Controller("academy-sync/publish")
export class AcademyPublishController {
  constructor(
    private readonly publishService: AcademyPublishService,
    private readonly receipts: AcademyReceiptService,
  ) {}

  @Get()
  @RequirePermission("academy:sync:view")
  @ApiOperation({ summary: "Is publishing on, and how many invoices are in sync, waiting or refused?" })
  @ApiResponse({ status: 200, type: AcademyPublishStatusDto })
  async status(): Promise<AcademyPublishStatusDto> {
    const [status, receiptSetup] = await Promise.all([this.publishService.getStatus(), this.receiptSetup()]);
    return toDto(status, receiptSetup);
  }

  @Put()
  @RequirePermission("academy:sync:manage")
  @ApiOperation({ summary: "Switch publishing of invoices to the parent portal on or off (off by default)" })
  @ApiResponse({ status: 200, type: AcademyPublishStatusDto })
  async setEnabled(@Body() dto: SetAcademyPublishDto, @Req() req: AuthenticatedRequest): Promise<AcademyPublishStatusDto> {
    await this.publishService.setEnabled(dto.enabled, req.user?.sub ?? null);
    return this.status();
  }

  @Post("run")
  @RequirePermission("academy:sync:manage")
  @ApiOperation({ summary: "Publish what is waiting now (up to 300 invoices; the scheduled sweep carries on with any backlog)" })
  @ApiResponse({ status: 201, type: AcademyPublishStatusDto })
  async run(): Promise<AcademyPublishStatusDto> {
    await this.publishService.publishPending({ maxBatches: MANUAL_RUN_BATCHES });
    return this.status();
  }

  /** What is left to set up for receipts to carry the school's logo, letterhead and a QR code; null if it cannot be checked (it never fails the page). */
  private async receiptSetup(): Promise<AcademyPublishStatusDto["receiptSetup"]> {
    try {
      return await this.receipts.readiness();
    } catch {
      return null;
    }
  }
}
