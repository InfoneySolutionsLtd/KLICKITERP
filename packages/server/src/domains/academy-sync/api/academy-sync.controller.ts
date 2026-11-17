import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AcademySyncService } from "../application/academy-sync.service";
import { AcadSyncRunEntity } from "../domain/acad-sync-run.entity";
import { AcademySyncRunDto, AcademySyncStatusDto, SetAcademyAutoSyncDto, StartAcademySyncRunDto } from "./dto/academy-sync.dto";
import { AuthenticatedRequest } from "./request-context";

function toRunDto(run: AcadSyncRunEntity): AcademySyncRunDto {
  return {
    id: run.id,
    mode: run.mode,
    scope: run.scope,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    counts: run.counts ?? {},
    issues: run.issues ?? [],
    issuesTotal: run.issuesTotal,
    error: run.error,
  };
}

/**
 * Staff side of the Academy student sync: see where it stands, preview what an import would do, run it, and switch
 * automatic sync on or off. The work itself happens in the background (`POST /runs` returns at once with a RUNNING
 * run; poll `GET /runs/:id`), because a school's roll can take minutes.
 */
@ApiTags("academy-sync")
@Controller("academy-sync")
export class AcademySyncController {
  constructor(private readonly syncService: AcademySyncService) {}

  @Get("status")
  @RequirePermission("academy:sync:view")
  @ApiOperation({ summary: "Where the Academy student sync stands: connected?, first import confirmed?, last runs" })
  @ApiResponse({ status: 200, type: AcademySyncStatusDto })
  async status(): Promise<AcademySyncStatusDto> {
    const status = await this.syncService.getStatus();
    return {
      connected: status.connected,
      academySchoolCode: status.academySchoolCode,
      firstImportConfirmedAt: status.state.firstImportConfirmedAt?.toISOString() ?? null,
      autoSyncEnabled: status.state.autoSyncEnabled,
      lastSuccessAt: status.state.lastSuccessAt?.toISOString() ?? null,
      lastFullSuccessAt: status.state.lastFullSuccessAt?.toISOString() ?? null,
      mappedStudents: status.mappedStudents,
      runningRun: status.runningRun ? toRunDto(status.runningRun) : null,
      lastPreview: status.lastPreview ? toRunDto(status.lastPreview) : null,
      lastImport: status.lastImport ? toRunDto(status.lastImport) : null,
    };
  }

  @Get("runs")
  @RequirePermission("academy:sync:view")
  @ApiOperation({ summary: "Recent preview/import runs, newest first" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, type: [AcademySyncRunDto] })
  async runs(@Query("limit") limit?: string): Promise<AcademySyncRunDto[]> {
    const parsed = Number(limit);
    return (await this.syncService.listRuns(Number.isFinite(parsed) && parsed > 0 ? parsed : 20)).map(toRunDto);
  }

  @Get("runs/:id")
  @RequirePermission("academy:sync:view")
  @ApiOperation({ summary: "One run, with its counts and the issues it found" })
  @ApiResponse({ status: 200, type: AcademySyncRunDto })
  async run(@Param("id", ParseUUIDPipe) id: string): Promise<AcademySyncRunDto> {
    const run = await this.syncService.getRun(id);
    if (!run) {
      throw new NotFoundException("Academy sync run", id);
    }
    return toRunDto(run);
  }

  @Post("runs")
  @RequirePermission("academy:sync:manage")
  @ApiOperation({ summary: "Start a preview or an import. Returns immediately; poll the run for progress." })
  @ApiResponse({ status: 201, type: AcademySyncRunDto })
  async start(@Body() dto: StartAcademySyncRunDto, @Req() req: AuthenticatedRequest): Promise<AcademySyncRunDto> {
    const { run } = await this.syncService.startRun({
      mode: dto.mode,
      scope: dto.scope ?? "INCREMENTAL",
      trigger: "MANUAL",
      actorId: req.user?.sub ?? null,
      confirmFirstImport: dto.confirmFirstImport,
    });
    return toRunDto(run);
  }

  @Put("settings")
  @RequirePermission("academy:sync:manage")
  @ApiOperation({ summary: "Switch scheduled (automatic) syncing on or off. Needs the first import to be confirmed." })
  @ApiResponse({ status: 200, type: AcademySyncStatusDto })
  async setAutoSync(@Body() dto: SetAcademyAutoSyncDto, @Req() req: AuthenticatedRequest): Promise<AcademySyncStatusDto> {
    await this.syncService.setAutoSync(dto.autoSyncEnabled, req.user?.sub ?? null);
    return this.status();
  }
}
