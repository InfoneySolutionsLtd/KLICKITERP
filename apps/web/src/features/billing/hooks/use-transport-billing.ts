"use client";

import { useMutation } from "@tanstack/react-query";
import type { BillTransportRouteDto } from "@klickit/contracts";
import { billTransportRoute } from "../api/transport-billing.api";

/** No cache to invalidate here — `bill_transport_route` itself is unchanged by billing it; the invoices it creates live under the Invoices module's own query keys, out of scope for this screen. */
export function useBillTransportRoute() {
  return useMutation({
    mutationFn: (dto: BillTransportRouteDto) => billTransportRoute(dto),
  });
}
