import { Body, Controller, Get, Put, Query, Req } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Repository } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { SettingsService } from "../../../platform/settings";
import { UsrUserEntity } from "../../../platform/users";
import { BANK_IPN_SYSTEM_ACTOR_SETTING_KEY } from "../application/kcb-ipn.service";
import { MPESA_SYSTEM_ACTOR_SETTING_KEY } from "../application/mpesa.service";
import { PayBankIpnEntity } from "../domain/pay-bank-ipn.entity";
import { PayBankIpnRepository } from "../infrastructure/pay-bank-ipn.repository";
import {
  BankIpnCashierStatusDto,
  BankIpnListQueryDto,
  BankIpnListResponseDto,
  BankIpnReadinessResponseDto,
  BankIpnResponseDto,
  SetBankIpnCashierDto,
} from "./dto/bank-ipn.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: PayBankIpnEntity): BankIpnResponseDto {
  return {
    id: entity.id,
    provider: entity.provider,
    kind: entity.kind,
    externalRef: entity.externalRef,
    amount: entity.amount.toDecimalString(),
    currency: entity.currency,
    customerReference: entity.customerReference,
    payerName: entity.payerName,
    payerMsisdnMasked: entity.payerMsisdnMasked,
    narration: entity.narration,
    creditAccount: entity.creditAccount,
    transactionAt: entity.transactionAt.toISOString(),
    state: entity.state,
    receiptId: entity.receiptId,
    suspenseItemId: entity.suspenseItemId,
    note: entity.note,
    createdAt: entity.createdAt.toISOString(),
  };
}

/**
 * The staff side of bank payment notifications: the log of what the bank has told the ERP (and what became of each),
 * and the one setting auto-receipting needs — which user is recorded as the cashier on receipts made without a human.
 */
@ApiTags("payments-bank-ipn")
@Controller("payments/bank-ipn")
export class BankIpnController {
  constructor(
    private readonly ipnRepository: PayBankIpnRepository,
    private readonly settingsService: SettingsService,
    @InjectRepository(UsrUserEntity) private readonly userRepository: Repository<UsrUserEntity>,
  ) {}

  @Get()
  @RequirePermission("payments:suspense:manage")
  @ApiOperation({ summary: "Payment notifications received from the bank, newest first, with what became of each" })
  @ApiResponse({ status: 200, type: BankIpnListResponseDto })
  async list(@Query() query: BankIpnListQueryDto): Promise<BankIpnListResponseDto> {
    const { items, total } = await this.ipnRepository.findPaginated(
      { state: query.state, kind: query.kind, q: query.q },
      { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
    );
    return { items: items.map(toView), total };
  }

  @Get("readiness")
  @RequirePermission("settings:integration:manage")
  @ApiOperation({ summary: "Whether bank payments can be receipted automatically — is a receipting cashier set?" })
  @ApiResponse({ status: 200, type: BankIpnReadinessResponseDto })
  async readiness(): Promise<BankIpnReadinessResponseDto> {
    return { cashier: await this.cashierStatus() };
  }

  @Put("cashier")
  @RequirePermission("settings:integration:manage")
  @ApiOperation({ summary: "Choose the user recorded as the cashier on receipts made from bank notifications" })
  @ApiResponse({ status: 200, type: BankIpnReadinessResponseDto })
  async setCashier(@Body() dto: SetBankIpnCashierDto, @Req() req: AuthenticatedRequest): Promise<BankIpnReadinessResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: dto.userId } });
    if (!user) throw new ValidationException("That user does not exist");
    if (user.status !== "ACTIVE") throw new ValidationException(`${user.fullName} is not an active user (status ${user.status}) — pick an active one`);
    await this.settingsService.set(BANK_IPN_SYSTEM_ACTOR_SETTING_KEY, dto.userId, false, req.user?.sub ?? null);
    return { cashier: await this.cashierStatus() };
  }

  /** The bank-specific setting first, then the M-Pesa one — the same order `KcbIpnService` reads them in. */
  private async cashierStatus(): Promise<BankIpnCashierStatusDto> {
    const bank = await this.settingsService.getTyped<string | null>(BANK_IPN_SYSTEM_ACTOR_SETTING_KEY, null);
    const mpesa = bank ? null : await this.settingsService.getTyped<string | null>(MPESA_SYSTEM_ACTOR_SETTING_KEY, null);
    const userId = bank ?? mpesa;
    if (!userId) return { configured: false, source: null, userId: null, userName: null, userActive: false };

    const user = await this.userRepository.findOne({ where: { id: userId } });
    const userActive = user?.status === "ACTIVE";
    return { configured: userActive, source: bank ? "BANK" : "MPESA", userId, userName: user?.fullName ?? null, userActive };
  }
}
