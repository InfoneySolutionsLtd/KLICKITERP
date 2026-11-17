import type { AcademySyncRunDto, AcademySyncStatusDto, StartAcademySyncRunDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

export type { AcademySyncRunDto, AcademySyncStatusDto, StartAcademySyncRunDto };

/** `GET /academy-sync/status` (`academy:sync:view`) — where the student sync stands, with the last preview/import and the one running now. */
export async function getAcademySyncStatus(): Promise<AcademySyncStatusDto> {
  return unwrapApiResult<AcademySyncStatusDto>(await apiClient.GET("/api/v1/academy-sync/status"));
}

/** `GET /academy-sync/runs/:id` (`academy:sync:view`) — one run with its counts and issues. */
export async function getAcademySyncRun(id: string): Promise<AcademySyncRunDto> {
  return unwrapApiResult<AcademySyncRunDto>(
    await apiClient.GET("/api/v1/academy-sync/runs/{id}", { params: { path: { id } } }),
  );
}

/** `POST /academy-sync/runs` (`academy:sync:manage`) — starts a preview or an import; returns at once with a RUNNING run. */
export async function startAcademySyncRun(body: StartAcademySyncRunDto): Promise<AcademySyncRunDto> {
  return unwrapApiResult<AcademySyncRunDto>(await apiClient.POST("/api/v1/academy-sync/runs", { body }));
}

/** `PUT /academy-sync/settings` (`academy:sync:manage`) — switch scheduled syncing on or off (needs the first import confirmed). */
export async function setAcademyAutoSync(autoSyncEnabled: boolean): Promise<AcademySyncStatusDto> {
  return unwrapApiResult<AcademySyncStatusDto>(
    await apiClient.PUT("/api/v1/academy-sync/settings", { body: { autoSyncEnabled } }),
  );
}
