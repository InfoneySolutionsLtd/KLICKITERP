import type { ReportResultResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * The controller's own `validateParamsShape()` rejects a present value of
 * the wrong primitive type but tolerates a missing key — it does NOT
 * tolerate an empty-string value on a "uuid"/"date"/"number" param (fails
 * its regex/typeof check, 400s). Callers must omit unset fields entirely
 * rather than send `key: ""`.
 *
 * `ExecuteReportDto.params` is a genuinely dynamic `Record<string, unknown>`
 * server-side, but Swagger can't reflect that into anything more specific
 * than a GENERATED, gapped `Record<string, never>` — same codegen-gap cast
 * pattern this codebase already uses repeatedly (e.g. `CreateVoucherRequestBody`
 * in `features/expenses/api/vouchers.api.ts`): this local interface mirrors
 * the generated (gapped) shape exactly, and the real, richer runtime object
 * is cast into it — the cast is a TypeScript-only fiction, the real object
 * still flows through unchanged at runtime.
 */
interface ExecuteReportRequestBody {
  params?: Record<string, never>;
}

export async function executeReport(code: string, params: Record<string, unknown>): Promise<ReportResultResponseDto> {
  return unwrapApiResult<ReportResultResponseDto>(
    await apiClient.POST("/api/v1/reports/{code}/execute", {
      params: { path: { code } },
      body: { params } as unknown as ExecuteReportRequestBody,
    }),
  );
}
