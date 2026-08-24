import type { CreateTransportRouteDto, TransportRouteResponseDto, UpdateTransportRouteDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `TransportRoutesController`
 * (`packages/server/src/domains/billing/api/transport-routes.controller.ts`)
 * — `POST/GET/GET:id/PATCH/:id/deactivate/:id/activate`, permissions
 * `billing:transport-route:manage`/`:view`. Mirrors `fee-categories.api.ts`
 * exactly in shape (Part 1, Billing sub-features batch).
 *
 * **Honest limitation, confirmed by grep of `invoicing.service.ts`/
 * `fee-structures.service.ts`**: `bill_transport_route.amount` is never read
 * anywhere in invoice generation — it's a pure reference table +
 * informational FK on `std_student.transport_route_id`. Every UI surface
 * consuming this module must not imply "this fee will be automatically
 * billed."
 */
export async function listTransportRoutes(): Promise<TransportRouteResponseDto[]> {
  return unwrapApiResult<TransportRouteResponseDto[]>(await apiClient.GET("/api/v1/billing/transport-routes"));
}

export async function getTransportRoute(id: string): Promise<TransportRouteResponseDto> {
  return unwrapApiResult<TransportRouteResponseDto>(
    await apiClient.GET("/api/v1/billing/transport-routes/{id}", { params: { path: { id } } }),
  );
}

export async function createTransportRoute(dto: CreateTransportRouteDto): Promise<TransportRouteResponseDto> {
  return unwrapApiResult<TransportRouteResponseDto>(
    await apiClient.POST("/api/v1/billing/transport-routes", { body: dto }),
  );
}

export async function updateTransportRoute(id: string, dto: UpdateTransportRouteDto): Promise<TransportRouteResponseDto> {
  return unwrapApiResult<TransportRouteResponseDto>(
    await apiClient.PATCH("/api/v1/billing/transport-routes/{id}", { params: { path: { id } }, body: dto }),
  );
}

export async function deactivateTransportRoute(id: string): Promise<TransportRouteResponseDto> {
  return unwrapApiResult<TransportRouteResponseDto>(
    await apiClient.POST("/api/v1/billing/transport-routes/{id}/deactivate", { params: { path: { id } } }),
  );
}

export async function activateTransportRoute(id: string): Promise<TransportRouteResponseDto> {
  return unwrapApiResult<TransportRouteResponseDto>(
    await apiClient.POST("/api/v1/billing/transport-routes/{id}/activate", { params: { path: { id } } }),
  );
}
