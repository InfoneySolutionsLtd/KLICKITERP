import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { TransportBillingService } from "../application/transport-billing.service";
import { BillTransportRouteDto, BillTransportResultDto } from "./dto/transport-billing.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * Own controller class (mirrors `BulkAdhocInvoicesController`'s own split
 * from `InvoicesController`) registered under the existing
 * `billing/transport-routes` prefix alongside `TransportRoutesController` —
 * Nest permits multiple controller classes sharing one prefix as long as
 * their own routes don't collide; `TransportRoutesController` never
 * declares a `bill` route.
 */
@ApiTags("billing-transport-billing")
@Controller("billing/transport-routes")
export class TransportBillingController {
  constructor(private readonly service: TransportBillingService) {}

  @Post("bill")
  @RequirePermission("billing:transport-route:bill")
  @ApiOperation({ summary: "Bill a transport route's flat fee to selected students for a term" })
  @ApiResponse({ status: 201, type: BillTransportResultDto })
  async bill(@Body() dto: BillTransportRouteDto, @Req() req: AuthenticatedRequest): Promise<BillTransportResultDto> {
    const initiatedBy = req.user?.sub;
    if (!initiatedBy) throw new Error("TransportBillingController.bill: no authenticated user on request");
    return this.service.billStudents(
      { routeId: dto.routeId, termId: dto.termId, studentIds: dto.studentIds, issueDate: dto.issueDate },
      initiatedBy,
    );
  }
}
