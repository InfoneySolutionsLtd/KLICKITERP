import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AcademyParentInvoicingSettingsService } from "../application/academy-parent-invoicing-settings.service";
import { AcademyParentInvoicingStatusDto, SetAcademyParentInvoicingDto } from "./dto/academy-parent-invoice.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * Staff side of "parents customise and generate their own fee invoices": see whether it is on and what is missing, switch
 * it on or off, and choose which roles are told when a parent generates an invoice.
 */
@ApiTags("academy-sync")
@Controller("academy-sync/parent-invoicing")
export class AcademyParentInvoicingController {
  constructor(private readonly settings: AcademyParentInvoicingSettingsService) {}

  @Get()
  @RequirePermission("academy:sync:view")
  @ApiOperation({ summary: "Can parents customise and generate their own fee invoices, who is notified, and what is still missing?" })
  @ApiResponse({ status: 200, type: AcademyParentInvoicingStatusDto })
  status(): Promise<AcademyParentInvoicingStatusDto> {
    return this.settings.getStatus();
  }

  @Put()
  @RequirePermission("academy:sync:manage")
  @ApiOperation({
    summary:
      "Switch parent invoicing on or off (off by default) and optionally set the roles notified when a parent generates an invoice. " +
      "Cannot be switched on until the ERP is connected and publishing to the parent portal is on.",
  })
  @ApiResponse({ status: 200, type: AcademyParentInvoicingStatusDto })
  update(@Body() dto: SetAcademyParentInvoicingDto, @Req() req: AuthenticatedRequest): Promise<AcademyParentInvoicingStatusDto> {
    return this.settings.update({ enabled: dto.enabled, notifyRoleIds: dto.notifyRoleIds }, req.user?.sub ?? null);
  }
}
