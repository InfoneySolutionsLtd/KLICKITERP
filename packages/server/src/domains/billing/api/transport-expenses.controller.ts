import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { Money } from "../../../shared/money/money";
import { TransportExpenseService } from "../application/transport-expense.service";
import { BillTransportExpenseEntity } from "../domain/bill-transport-expense.entity";
import type { ExpVoucherEntity } from "../../expenses";
import { LogTransportExpenseDto, TransportExpenseResponseDto } from "./dto/transport-expense.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BillTransportExpenseEntity, voucher: ExpVoucherEntity): TransportExpenseResponseDto {
  return {
    id: entity.id,
    routeId: entity.routeId,
    voucherId: entity.voucherId,
    voucherNumber: voucher.number,
    amount: voucher.amount.toDecimalString(),
    status: voucher.status,
    narrative: voucher.narrative,
    createdAt: entity.createdAt.toISOString(),
  };
}

function toViewFromLoaded(entity: BillTransportExpenseEntity): TransportExpenseResponseDto {
  if (!entity.voucher) throw new Error("TransportExpensesController.toViewFromLoaded: voucher relation not loaded");
  return toView(entity, entity.voucher);
}

@ApiTags("billing-transport-expenses")
@Controller("billing/transport-routes/:routeId/expenses")
export class TransportExpensesController {
  constructor(private readonly service: TransportExpenseService) {}

  @Post()
  @RequirePermission("billing:transport-expense:manage")
  @ApiOperation({ summary: "Log a bus expense (a real exp_voucher) against a transport route" })
  @ApiResponse({ status: 201, type: TransportExpenseResponseDto })
  async logExpense(
    @Param("routeId") routeId: string,
    @Body() dto: LogTransportExpenseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TransportExpenseResponseDto> {
    const { expense, voucher } = await this.service.logExpense(
      {
        routeId,
        payeeType: dto.payeeType,
        payeeRef: dto.payeeRef,
        amount: Money.fromDecimalString(dto.amount),
        method: dto.method,
        narrative: dto.narrative,
      },
      req.user?.sub ?? null,
    );
    return toView(expense, voucher);
  }

  @Get()
  @RequirePermission("billing:transport-expense:view")
  @ApiOperation({ summary: "List bus expenses logged against a transport route" })
  @ApiResponse({ status: 200, type: [TransportExpenseResponseDto] })
  async list(@Param("routeId") routeId: string): Promise<TransportExpenseResponseDto[]> {
    return (await this.service.listByRoute(routeId)).map(toViewFromLoaded);
  }
}
