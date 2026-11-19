import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AcademySetupGuideService } from "../application/academy-setup-guide.service";
import { AcademySetupGuideDto, SetPaymentsCashierDto } from "./dto/academy-setup-guide.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * The guided configuration of the Klickit Academy link, shown at the top of the Licence page: each step, whether it is done,
 * what it needs, and the next one to do. It is worked out from the real state on every call (nothing is stored).
 */
@ApiTags("academy-sync")
@Controller("academy-sync/setup-guide")
export class AcademySetupGuideController {
  constructor(private readonly guide: AcademySetupGuideService) {}

  @Get()
  @RequirePermission("academy:sync:view")
  @ApiOperation({ summary: "The setup steps for the Klickit Academy link: done / to do / needs attention / locked, what each needs, and the next step" })
  @ApiResponse({ status: 200, type: AcademySetupGuideDto })
  get(): Promise<AcademySetupGuideDto> {
    return this.guide.getGuide();
  }

  @Put("payments-cashier")
  @RequirePermission("academy:sync:manage")
  @ApiOperation({
    summary:
      "Choose the user the receipts of parent M-Pesa payments are recorded under (the M-Pesa system cashier). The user must exist and be active; a refused choice changes nothing.",
  })
  @ApiResponse({ status: 200, type: AcademySetupGuideDto })
  setPaymentsCashier(@Body() dto: SetPaymentsCashierDto, @Req() req: AuthenticatedRequest): Promise<AcademySetupGuideDto> {
    return this.guide.setPaymentsCashier(dto.userId, req.user?.sub ?? null);
  }
}
