import type {
  BillTransportRouteDto,
  BillTransportResultDto,
  RegenerateTransportBillingDto,
  TransportRegenerateResultDto,
} from "@klickit/contracts";
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

/**
 * `POST billing/transport-routes/regenerate` — "regenerate like previous
 * term" for Transport, mirroring `bulk-billing.api.ts`'s own redesigned
 * carried-forward algorithm: for every student who had real transport
 * billing in the term immediately preceding `dto.termId`, generates a new
 * invoice on that SAME route, priced at the route's CURRENT amount.
 * `dto.routeId` optionally narrows to one route's prior riders. Same
 * permission as `billTransportRoute()` (`billing:transport-route:bill`).
 */
export async function regenerateTransportBilling(dto: RegenerateTransportBillingDto): Promise<TransportRegenerateResultDto> {
  return unwrapApiResult<TransportRegenerateResultDto>(
    await apiClient.POST("/api/v1/billing/transport-routes/regenerate", { body: dto }),
  );
}
