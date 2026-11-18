import type { AcademyPublishStatusDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

export type { AcademyPublishStatusDto };

/** `GET /academy-sync/publish` (`academy:sync:view`) — is publishing on, and how many invoices are in sync, waiting or refused? */
export async function getAcademyPublish(): Promise<AcademyPublishStatusDto> {
  return unwrapApiResult<AcademyPublishStatusDto>(await apiClient.GET("/api/v1/academy-sync/publish"));
}

/** `PUT /academy-sync/publish` (`academy:sync:manage`) — switch publishing of invoices to the parent portal on or off (off by default). */
export async function setAcademyPublish(enabled: boolean): Promise<AcademyPublishStatusDto> {
  return unwrapApiResult<AcademyPublishStatusDto>(await apiClient.PUT("/api/v1/academy-sync/publish", { body: { enabled } }));
}

/** `POST /academy-sync/publish/run` (`academy:sync:manage`) — publish what is waiting now (up to 300 invoices; the sweep carries on with any backlog). */
export async function runAcademyPublish(): Promise<AcademyPublishStatusDto> {
  return unwrapApiResult<AcademyPublishStatusDto>(await apiClient.POST("/api/v1/academy-sync/publish/run"));
}
