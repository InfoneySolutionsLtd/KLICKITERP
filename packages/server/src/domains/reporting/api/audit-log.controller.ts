import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AuditLogReport } from "../application/audit-log.report";
import { ReportResultResponseDto } from "./dto/report-catalogue.dto";

/**
 * A DISTINCT, separately-controlled endpoint for `AuditLogReport` rather
 * than folding it into `reports.controller.ts`'s generic `:code/execute`
 * route — per the task brief, audit visibility is sensitive enough (WHO
 * changed WHAT, `before`/`after` diffs) that it deserves its own STATIC
 * `@RequirePermission("reports:audit-log:view")` rather than living behind
 * the generic dynamic-permission `POST /reports/:code/execute` mechanism
 * every OTHER report shares — a real, distinct code path a reviewer can
 * find by grepping for `RequirePermission` alone, without having to reason
 * about the dynamic-check indirection `reports.controller.ts` uses for
 * everything else. `AuditLogReport` REMAINS registered in
 * `ReportRegistryService` too (so it still appears in the catalogue and
 * COULD in principle be executed via the generic route, since its
 * `permissionCode` is checked there identically) — this controller is an
 * additional, more discoverable, purpose-built surface, not a replacement.
 *
 * Route is `GET /reports/audit-log/search`, not the bare `GET /reports/audit-log`
 * this controller originally used. The bare path is a real, live route
 * collision with `ReportsController.get(":code")` (`GET /reports/:code`,
 * the generic catalogue-definition fetch every report code, including this
 * one, needs). `AuditLogController` is registered before `ReportsController`
 * specifically so its own literal routes win route matching (see
 * `reporting.module.ts`'s own doc comment on controller order) - so the bare
 * path made `GET /reports/audit-log` permanently unreachable for its actual
 * purpose. Any caller doing that generically (a frontend rendering a params
 * form before executing) instead silently hit this `search()` handler with
 * `fromDate`/`toDate` both `undefined`, producing a real, confirmed-live 500
 * (`invalid input syntax for type timestamp with time zone:
 * "undefinedT00:00:00.000Z"`, `undefined` template-literal-coerced into
 * that string). The extra `/search` segment takes this route out of the
 * single-segment `:code` wildcard's match space entirely, the same
 * reasoning `/reports/export/:id`'s own extra segment already relies on. No
 * real caller of the old bare path existed (confirmed - nothing in
 * `apps/web` used it before this fix).
 */
@ApiTags("reporting-audit-log")
@Controller("reports/audit-log")
@RequirePermission("reports:audit-log:view")
export class AuditLogController {
  constructor(private readonly auditLogReport: AuditLogReport) {}

  @Get("search")
  @ApiQuery({ name: "entityType", required: false })
  @ApiQuery({ name: "entityId", required: false })
  @ApiQuery({ name: "actorId", required: false })
  @ApiQuery({ name: "fromDate", required: true })
  @ApiQuery({ name: "toDate", required: true })
  @ApiOperation({ summary: "Query audit.audit_log by entity/actor/date range" })
  @ApiResponse({ status: 200, type: ReportResultResponseDto })
  async search(
    @Query("fromDate") fromDate: string,
    @Query("toDate") toDate: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("actorId") actorId?: string,
  ): Promise<ReportResultResponseDto> {
    const result = await this.auditLogReport.execute({ entityType, entityId, actorId, fromDate, toDate });
    return { rows: result.rows, totals: result.totals, generatedAt: result.generatedAt.toISOString() };
  }
}
