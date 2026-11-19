import type { AcademyParentInvoicingStatusDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

export type { AcademyParentInvoicingStatusDto };

/** `GET /academy-sync/parent-invoicing` (`academy:sync:view`) — is it on, who is notified, and what is still missing? */
export async function getAcademyParentInvoicing(): Promise<AcademyParentInvoicingStatusDto> {
  return unwrapApiResult<AcademyParentInvoicingStatusDto>(await apiClient.GET("/api/v1/academy-sync/parent-invoicing"));
}

/**
 * `PUT /academy-sync/parent-invoicing` (`academy:sync:manage`) — switch parents customising and generating their own fee invoices on
 * or off (off by default) and, optionally, set the roles notified when one does (`[]` = everyone who can post invoices).
 */
export async function setAcademyParentInvoicing(input: { enabled: boolean; notifyRoleIds?: string[] }): Promise<AcademyParentInvoicingStatusDto> {
  return unwrapApiResult<AcademyParentInvoicingStatusDto>(await apiClient.PUT("/api/v1/academy-sync/parent-invoicing", { body: input }));
}
