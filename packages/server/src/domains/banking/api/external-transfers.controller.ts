import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { Money } from "../../../shared/money/money";
import { BankExternalTransfersService } from "../application/bank-external-transfers.service";
import { BankExternalTransferEntity, BankExternalTransferStatus } from "../domain/bank-external-transfer.entity";
import {
  BankExternalTransferResponseDto,
  CreateBankExternalTransferDto,
  UpdateBankExternalTransferReferenceDto,
} from "./dto/external-transfer.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: BankExternalTransferEntity): BankExternalTransferResponseDto {
  return {
    id: entity.id,
    number: entity.number,
    sourceAccountId: entity.sourceAccountId,
    beneficiaryName: entity.beneficiaryName,
    beneficiaryBankName: entity.beneficiaryBankName,
    beneficiaryBranch: entity.beneficiaryBranch,
    beneficiaryAccountNo: entity.beneficiaryAccountNo,
    debitAccountId: entity.debitAccountId,
    amount: entity.amount.toDecimalString(),
    status: entity.status,
    approvalRef: entity.approvalRef,
    journalId: entity.journalId,
    feeAmount: entity.feeAmount?.toDecimalString() ?? null,
    referenceNo: entity.referenceNo,
    expectedClearingDate: entity.expectedClearingDate,
  };
}

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`ExternalTransfersController.${action}: no authenticated user on request`);
  return userId;
}

/** `bank_external_transfer` create -> submit -> approve/reject -> post (P-35, pay a beneficiary the school does not own an account for). */
@ApiTags("banking-external-transfers")
@Controller("banking/external-transfers")
export class ExternalTransfersController {
  constructor(
    private readonly transfersService: BankExternalTransfersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("banking:external-transfer:create")
  @ApiOperation({ summary: "Create a DRAFT external bank transfer to a beneficiary the school does not own an account for" })
  @ApiResponse({ status: 201, type: BankExternalTransferResponseDto })
  async create(
    @Body() dto: CreateBankExternalTransferDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BankExternalTransferResponseDto> {
    const created = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.create(
        manager,
        {
          sourceAccountId: dto.sourceAccountId,
          beneficiaryName: dto.beneficiaryName,
          beneficiaryBankName: dto.beneficiaryBankName,
          beneficiaryBranch: dto.beneficiaryBranch,
          beneficiaryAccountNo: dto.beneficiaryAccountNo,
          debitAccountId: dto.debitAccountId,
          amount: Money.fromDecimalString(dto.amount),
          feeAmount: dto.feeAmount ? Money.fromDecimalString(dto.feeAmount) : undefined,
          referenceNo: dto.referenceNo,
          expectedClearingDate: dto.expectedClearingDate,
        },
        req.user?.sub ?? null,
      ),
    );
    return toView(created);
  }

  @Get()
  @RequirePermission("banking:external-transfer:create")
  @ApiOperation({ summary: "List external bank transfers, optionally filtered by status/sourceAccountId" })
  @ApiResponse({ status: 200, type: [BankExternalTransferResponseDto] })
  async list(
    @Query("status") status?: BankExternalTransferStatus,
    @Query("sourceAccountId") sourceAccountId?: string,
  ): Promise<BankExternalTransferResponseDto[]> {
    return (await this.transfersService.list({ status, sourceAccountId })).map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:external-transfer:create")
  @ApiOperation({ summary: "Get an external bank transfer by id" })
  @ApiResponse({ status: 200, type: BankExternalTransferResponseDto })
  async findOne(@Param("id") id: string): Promise<BankExternalTransferResponseDto> {
    return toView(await this.transfersService.findByIdOrFail(id));
  }

  @Patch(":id/reference")
  @RequirePermission("banking:external-transfer:create")
  @ApiOperation({ summary: "Set/update a transfer's bank-assigned reference number, at any status" })
  @ApiResponse({ status: 200, type: BankExternalTransferResponseDto })
  async updateReference(
    @Param("id") id: string,
    @Body() dto: UpdateBankExternalTransferReferenceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BankExternalTransferResponseDto> {
    const transfer = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.updateReferenceNo(manager, id, dto.referenceNo, req.user?.sub ?? null),
    );
    return toView(transfer);
  }

  @Post(":id/submit")
  @RequirePermission("banking:external-transfer:create")
  @ApiOperation({ summary: "Submit a DRAFT external transfer for approval (EXTERNAL_BANK_TRANSFERS workflow)" })
  @ApiResponse({ status: 200, type: BankExternalTransferResponseDto })
  async submit(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankExternalTransferResponseDto> {
    const initiatorId = requireUserId(req, "submit");
    const transfer = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.submitForApproval(manager, id, initiatorId),
    );
    return toView(transfer);
  }

  @Post(":id/approve")
  @RequirePermission("banking:external-transfer:decide")
  @ApiOperation({ summary: "Manually record APPROVED for a PENDING_APPROVAL external transfer (interim manual-trigger pattern)" })
  @ApiResponse({ status: 200, type: BankExternalTransferResponseDto })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankExternalTransferResponseDto> {
    const transfer = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.onApprovalDecided(manager, id, true, req.user?.sub ?? null),
    );
    return toView(transfer);
  }

  @Post(":id/reject")
  @RequirePermission("banking:external-transfer:decide")
  @ApiOperation({ summary: "Manually record a rejection for a PENDING_APPROVAL external transfer (reverts to DRAFT)" })
  @ApiResponse({ status: 200, type: BankExternalTransferResponseDto })
  async reject(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankExternalTransferResponseDto> {
    const transfer = await runInTransaction(this.dataSource, (manager) =>
      this.transfersService.onApprovalDecided(manager, id, false, req.user?.sub ?? null),
    );
    return toView(transfer);
  }

  @Post(":id/post")
  @RequirePermission("banking:external-transfer:post")
  @ApiOperation({ summary: "Post an APPROVED external transfer (realizes P-35's 2-or-4-line journal)" })
  @ApiResponse({ status: 200, type: BankExternalTransferResponseDto })
  async post(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<BankExternalTransferResponseDto> {
    const postedBy = requireUserId(req, "post");
    const transfer = await runInTransaction(this.dataSource, (manager) => this.transfersService.post(manager, id, postedBy));
    return toView(transfer);
  }
}
