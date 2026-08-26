import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { runInTransaction } from "../../../shared/database/tx";
import { BankFeedImportService } from "../application/bank-feed-import.service";
import { BankStatementImportService } from "../application/bank-statement-import.service";
import { BankStatementImportEntity } from "../domain/bank-statement-import.entity";
import {
  BankStatementImportResponseDto,
  FetchBankFeedDto,
  ImportBankStatementLinesDto,
  ImportBankStatementLinesResponseDto,
} from "./dto/statement-import.dto";
import { AuthenticatedRequest } from "./request-context";

function requireUserId(req: AuthenticatedRequest, action: string): string {
  const userId = req.user?.sub;
  if (!userId) throw new Error(`StatementImportController.${action}: no authenticated user on request`);
  return userId;
}

function toView(entity: BankStatementImportEntity): BankStatementImportResponseDto {
  return {
    id: entity.id,
    accountId: entity.accountId,
    fileId: entity.fileId,
    mappingTemplate: entity.mappingTemplate,
    importedAt: entity.importedAt,
    lineCount: entity.lineCount,
    duplicateCount: entity.duplicateCount,
  };
}

/** FR-BANK-003.1 — bank statement import with per-bank saved mapping templates and dedupe-on-reimport. */
@ApiTags("banking-statement-import")
@Controller("banking/statement-imports")
export class StatementImportController {
  constructor(
    private readonly statementImportService: BankStatementImportService,
    private readonly bankFeedImportService: BankFeedImportService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post()
  @RequirePermission("banking:statement:import")
  @ApiOperation({ summary: "Import bank statement lines against a saved mapping template (dedupe-on-reimport via BR-BANK-02's hash)" })
  @ApiResponse({ status: 201, type: ImportBankStatementLinesResponseDto })
  async importLines(@Body() dto: ImportBankStatementLinesDto): Promise<ImportBankStatementLinesResponseDto> {
    const result = await runInTransaction(this.dataSource, (manager) =>
      this.statementImportService.importLines(manager, {
        accountId: dto.accountId,
        fileId: dto.fileId,
        mappingTemplate: dto.mappingTemplate,
        rawRows: dto.rawRows,
      }),
    );
    return {
      importId: result.import.id,
      insertedCount: result.insertedCount,
      duplicateCount: result.duplicateCount,
    };
  }

  /**
   * Complete the Integrations area, Part 4.2 — the "Fetch Now" manual
   * trigger for a real `BANK` integration feed (`BankFeedAdapterResolverService`/
   * `GenericHttpBankFeedAdapter`). Reuses `banking:statement:import` —
   * deliberately not a new permission code, since this is the same class of
   * action as a manual CSV import (both end up calling `importLines()`),
   * just sourced from a live feed instead of a client-parsed file.
   */
  @Post("fetch")
  @RequirePermission("banking:statement:import")
  @ApiOperation({ summary: "Fetch new transactions from this account's configured BANK integration feed and import them (same dedupe as a manual import)" })
  @ApiResponse({ status: 201, type: ImportBankStatementLinesResponseDto })
  async fetch(@Body() dto: FetchBankFeedDto, @Req() req: AuthenticatedRequest): Promise<ImportBankStatementLinesResponseDto> {
    const actorId = requireUserId(req, "fetch");
    const result = await this.bankFeedImportService.fetchAndImport(dto.accountId, actorId);
    return {
      importId: result.import.id,
      insertedCount: result.insertedCount,
      duplicateCount: result.duplicateCount,
    };
  }

  @Get()
  @RequirePermission("banking:statement:import")
  @ApiOperation({ summary: "List statement import runs, optionally filtered by accountId" })
  @ApiResponse({ status: 200, type: [BankStatementImportResponseDto] })
  async list(@Query("accountId") accountId?: string): Promise<BankStatementImportResponseDto[]> {
    return (await this.statementImportService.list(accountId)).map(toView);
  }

  @Get(":id")
  @RequirePermission("banking:statement:import")
  @ApiOperation({ summary: "Get a statement import run by id" })
  @ApiResponse({ status: 200, type: BankStatementImportResponseDto })
  async findOne(@Param("id") id: string): Promise<BankStatementImportResponseDto> {
    return toView(await this.statementImportService.findByIdOrFail(id));
  }
}
