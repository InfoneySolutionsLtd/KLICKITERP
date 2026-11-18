import type { AcademyLinkStatusDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

export type { AcademyLinkStatusDto };

/** `GET /academy-sync/link` (`academy:sync:view`) — is this ERP registered with the Academy, and did the last connection test pass? */
export async function getAcademyLink(): Promise<AcademyLinkStatusDto> {
  return unwrapApiResult<AcademyLinkStatusDto>(await apiClient.GET("/api/v1/academy-sync/link"));
}

/**
 * `PUT /academy-sync/link` (`academy:sync:manage`) — tells the Academy this ERP's public API address. The Academy answers with
 * a shared secret that signs its calls; the server stores it encrypted and never returns it. Registering again rotates it.
 */
export async function registerAcademyLink(erpBaseUrl: string): Promise<AcademyLinkStatusDto> {
  return unwrapApiResult<AcademyLinkStatusDto>(await apiClient.PUT("/api/v1/academy-sync/link", { body: { erpBaseUrl } }));
}

/** `POST /academy-sync/link/test` (`academy:sync:manage`) — asks the Academy to call this ERP's signed ping and report back. */
export async function testAcademyLink(): Promise<AcademyLinkStatusDto> {
  return unwrapApiResult<AcademyLinkStatusDto>(await apiClient.POST("/api/v1/academy-sync/link/test"));
}
