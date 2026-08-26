import type { SavedParamsResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * `CreateSavedParamsDto.params`/`UpdateSavedParamsDto.params` degrade to a
 * generated, gapped `Record<string, never>` (same codegen-gap-cast pattern
 * as `execute.api.ts`/`export.api.ts`) — mirrored here and cast at the
 * boundary; the real, richer runtime object still flows through unchanged.
 */
interface CreateSavedParamsRequestBody {
  reportCode: string;
  name: string;
  params: Record<string, never>;
}

interface UpdateSavedParamsRequestBody {
  name?: string;
  params?: Record<string, never>;
}

export async function listMySavedParams(): Promise<SavedParamsResponseDto[]> {
  return unwrapApiResult<SavedParamsResponseDto[]>(await apiClient.GET("/api/v1/reports/saved-params/mine"));
}

export async function getSavedParams(id: string): Promise<SavedParamsResponseDto> {
  return unwrapApiResult<SavedParamsResponseDto>(
    await apiClient.GET("/api/v1/reports/saved-params/{id}", { params: { path: { id } } }),
  );
}

export async function createSavedParams(
  reportCode: string,
  name: string,
  params: Record<string, unknown>,
): Promise<SavedParamsResponseDto> {
  return unwrapApiResult<SavedParamsResponseDto>(
    await apiClient.POST("/api/v1/reports/saved-params", {
      body: { reportCode, name, params } as unknown as CreateSavedParamsRequestBody,
    }),
  );
}

/** `name` alone renames (`RenameSavedParamsDialog`); `params` alone overwrites a saved set's values in place from the report page itself (`ReportDetailBody`'s "Update saved report" action) — either or both may be sent. */
export async function updateSavedParams(
  id: string,
  dto: { name?: string; params?: Record<string, unknown> },
): Promise<SavedParamsResponseDto> {
  return unwrapApiResult<SavedParamsResponseDto>(
    await apiClient.PATCH("/api/v1/reports/saved-params/{id}", {
      params: { path: { id } },
      body: dto as unknown as UpdateSavedParamsRequestBody,
    }),
  );
}

export async function deleteSavedParams(id: string): Promise<void> {
  await apiClient.DELETE("/api/v1/reports/saved-params/{id}", { params: { path: { id } } });
}
