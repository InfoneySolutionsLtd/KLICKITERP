import type { AcademySetupGuideDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

export type { AcademySetupGuideDto };

/** `GET /academy-sync/setup-guide` (`academy:sync:view`) — the setup steps for the Klickit Academy link, what each needs, and the next one to do. */
export async function getAcademySetupGuide(): Promise<AcademySetupGuideDto> {
  return unwrapApiResult<AcademySetupGuideDto>(await apiClient.GET("/api/v1/academy-sync/setup-guide"));
}

/**
 * `PUT /academy-sync/setup-guide/payments-cashier` (`academy:sync:manage`) — choose the user the receipts of parent M-Pesa payments
 * are recorded under. The user must be active. Returns the refreshed guide.
 */
export async function setPaymentsCashier(userId: string): Promise<AcademySetupGuideDto> {
  return unwrapApiResult<AcademySetupGuideDto>(await apiClient.PUT("/api/v1/academy-sync/setup-guide/payments-cashier", { body: { userId } }));
}
