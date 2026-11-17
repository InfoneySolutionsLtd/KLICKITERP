import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { BankTransferDispatchService } from "../application/bank-transfer-dispatch.service";
import { BankExternalTransferDispatchEntity } from "../domain/bank-external-transfer-dispatch.entity";
import { BankExternalTransferDispatchResponseDto, DispatchExternalTransferDto, ResolveDispatchDto } from "./dto/external-transfer-dispatch.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BankExternalTransferDispatchEntity): BankExternalTransferDispatchResponseDto {
  return {
    id: entity.id,
    transferId: entity.transferId,
    provider: entity.provider,
    reference: entity.reference,
    status: entity.status,
    amount: entity.amount.toDecimalString(),
    bankRef: entity.bankRef,
    note: entity.note,
    createdAt: entity.createdAt.toISOString(),
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`ExternalTransferDispatchController.${action}: no authenticated user on request`);
  return userId;
}

/**
 * Sending an approved external transfer through the bank's API (KCB Funds Transfer) — see
 * `BankTransferDispatchService` for the safety rules. Seeing the attempts needs the same permission as seeing the
 * transfer; SENDING and resolving need the separate, admin-only `banking:external-transfer:dispatch`.
 */
@ApiTags("banking-external-transfers")
@Controller("banking/external-transfers/:id/dispatches")
export class ExternalTransferDispatchController {
  constructor(private readonly dispatchService: BankTransferDispatchService) {}

  @Get()
  @RequirePermission("banking:external-transfer:create")
  @ApiOperation({ summary: "The attempts made to send this transfer through the bank (newest first)" })
  @ApiResponse({ status: 200, type: [BankExternalTransferDispatchResponseDto] })
  async list(@Param("id") id: string): Promise<BankExternalTransferDispatchResponseDto[]> {
    return (await this.dispatchService.listForTransfer(id)).map(toView);
  }

  @Post()
  @RequirePermission("banking:external-transfer:dispatch")
  @ApiOperation({ summary: "Send this APPROVED transfer through KCB's Funds Transfer API — moves real money; one live attempt at a time" })
  @ApiResponse({ status: 201, type: BankExternalTransferDispatchResponseDto })
  async dispatch(@Param("id") id: string, @Body() dto: DispatchExternalTransferDto, @Req() req: AuthenticatedRequest): Promise<BankExternalTransferDispatchResponseDto> {
    return toView(await this.dispatchService.dispatch(id, requireUserId(req, "dispatch"), dto));
  }

  @Post(":dispatchId/resolve")
  @RequirePermission("banking:external-transfer:dispatch")
  @ApiOperation({ summary: "Settle an attempt whose outcome is unknown, after checking with the bank" })
  @ApiResponse({ status: 201, type: BankExternalTransferDispatchResponseDto })
  async resolve(@Param("dispatchId") dispatchId: string, @Body() dto: ResolveDispatchDto, @Req() req: AuthenticatedRequest): Promise<BankExternalTransferDispatchResponseDto> {
    return toView(await this.dispatchService.resolve(dispatchId, dto, requireUserId(req, "resolve")));
  }
}
