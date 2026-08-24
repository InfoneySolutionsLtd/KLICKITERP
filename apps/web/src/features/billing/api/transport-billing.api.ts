import type { BillTransportRouteDto, BillTransportResultDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `TransportBillingController`
 * (`packages/server/src/domains/billing/api/transport-billing.controller.ts`)
 * — `POST billing/transport-routes/bill`, permission
 * `billing:transport-route:bill`. Bills a route's flat `amount` to a
 * caller-selected list of students for one term via the ADHOC invoice path;
 * generates + posts one real invoice per student. Mirrors
 * `bulk-adhoc-invoices.api.ts`'s single-function shape.
 */
export async function billTransportRoute(dto: BillTransportRouteDto): Promise<BillTransportResultDto> {
  return unwrapApiResult<BillTransportResultDto>(
    await apiClient.POST("/api/v1/billing/transport-routes/bill", { body: dto }),
  );
}
