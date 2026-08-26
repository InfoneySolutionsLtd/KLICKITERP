import type { domains_reporting_schedule_schema } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/** `schedule.schema.ts` is exported as a namespace, not flattened, from the contracts barrel — a real name collision with `payroll/loan.schema.ts`/`expenses/recurring.schema.ts`'s own `RunDueDto`-family exports (confirmed by grep) — same established `domains_<x>_schema.Y` access pattern already used for `domains_wallet_wallet_transaction_schema`/`domains_inventory_category_schema`. */
export type ScheduleResponseDto = domains_reporting_schedule_schema.ScheduleResponseDto;

export type ScheduleFormat = "CSV" | "XLSX" | "PDF";

/**
 * `CreateScheduleDto.params`/`UpdateScheduleDto.params` degrade to a
 * generated, gapped `Record<string, never>` (same pattern as
 * `saved-params.api.ts`) — mirrored and cast at the boundary. `recipients`
 * on the REQUEST side generates correctly as real `string[]`, no cast
 * needed there.
 */
interface CreateScheduleRequestBody {
  reportCode: string;
  params: Record<string, never>;
  cron: string;
  recipients: string[];
  format: ScheduleFormat;
}

interface UpdateScheduleRequestBody {
  cron?: string;
  recipients?: string[];
  isActive?: boolean;
}

/**
 * `RunDueResult` — hand-mirrored from `ReportSchedulesService`'s own real
 * exported type (`packages/server/src/domains/reporting/application/report-schedules.service.ts`).
 * `POST /reports/schedules/run-due`'s controller method has no
 * `@ApiResponse({type})` decorator, so its response is entirely absent from
 * the generated contracts — `unwrapApiResult`'s own `data` parameter is
 * already typed `unknown`, so no cast is needed to supply this type
 * explicitly at the call site.
 */
export interface RunDueResult {
  scheduleId: string;
  reportCode: string;
  ok: boolean;
  exportJobId: string | null;
}

export async function listMySchedules(): Promise<ScheduleResponseDto[]> {
  return unwrapApiResult<ScheduleResponseDto[]>(await apiClient.GET("/api/v1/reports/schedules"));
}

export async function getSchedule(id: string): Promise<ScheduleResponseDto> {
  return unwrapApiResult<ScheduleResponseDto>(
    await apiClient.GET("/api/v1/reports/schedules/{id}", { params: { path: { id } } }),
  );
}

export async function createSchedule(
  reportCode: string,
  params: Record<string, unknown>,
  cron: string,
  recipients: string[],
  format: ScheduleFormat,
): Promise<ScheduleResponseDto> {
  return unwrapApiResult<ScheduleResponseDto>(
    await apiClient.POST("/api/v1/reports/schedules", {
      body: { reportCode, params, cron, recipients, format } as unknown as CreateScheduleRequestBody,
    }),
  );
}

export async function updateSchedule(
  id: string,
  dto: { cron?: string; recipients?: string[]; isActive?: boolean },
): Promise<ScheduleResponseDto> {
  return unwrapApiResult<ScheduleResponseDto>(
    await apiClient.PATCH("/api/v1/reports/schedules/{id}", {
      params: { path: { id } },
      body: dto as unknown as UpdateScheduleRequestBody,
    }),
  );
}

export async function deleteSchedule(id: string): Promise<void> {
  await apiClient.DELETE("/api/v1/reports/schedules/{id}", { params: { path: { id } } });
}

export async function runSchedulesDue(asOfDate?: string): Promise<RunDueResult[]> {
  return unwrapApiResult<RunDueResult[]>(
    await apiClient.POST("/api/v1/reports/schedules/run-due", { body: { asOfDate } }),
  );
}

/**
 * `ScheduleResponseDto.recipients` (RESPONSE side, unlike the request DTOs
 * above) generates as a gapped `Record<string, never>`, not `string[]` — a
 * missing `@ApiProperty({type: [String]})` on the DTO, same class of gap
 * `lib/api-error.ts`'s own doc comment documents for a Students DTO. The
 * real wire JSON is already a genuine array; this only fixes the TS view of it.
 */
export function scheduleRecipients(schedule: ScheduleResponseDto): string[] {
  const raw = schedule.recipients as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

/** `ScheduleResponseDto.lastOk` has the identical gap — real type `boolean | null`. */
export function scheduleLastOk(schedule: ScheduleResponseDto): boolean | null {
  const raw = schedule.lastOk as unknown;
  return typeof raw === "boolean" ? raw : null;
}
