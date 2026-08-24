import type { CreateConcessionSchemeDto, ConcessionSchemeResponseDto, UpdateConcessionSchemeDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `ConcessionSchemesController`
 * (`packages/server/src/domains/billing/api/concession-schemes.controller.ts`)
 * — `POST/GET/GET:id/PATCH/:id/deactivate/:id/activate`, permissions
 * `billing:concession-scheme:manage`/`:view`. Mirrors `fee-categories.api.ts`
 * exactly in shape (Part 1, Billing sub-features batch) — same CRUD +
 * activate/deactivate pattern, no delete endpoint on this controller either.
 */
export async function listConcessionSchemes(): Promise<ConcessionSchemeResponseDto[]> {
  return unwrapApiResult<ConcessionSchemeResponseDto[]>(await apiClient.GET("/api/v1/billing/concession-schemes"));
}

export async function getConcessionScheme(id: string): Promise<ConcessionSchemeResponseDto> {
  return unwrapApiResult<ConcessionSchemeResponseDto>(
    await apiClient.GET("/api/v1/billing/concession-schemes/{id}", { params: { path: { id } } }),
  );
}

export async function createConcessionScheme(dto: CreateConcessionSchemeDto): Promise<ConcessionSchemeResponseDto> {
  return unwrapApiResult<ConcessionSchemeResponseDto>(
    await apiClient.POST("/api/v1/billing/concession-schemes", { body: dto }),
  );
}

export async function updateConcessionScheme(id: string, dto: UpdateConcessionSchemeDto): Promise<ConcessionSchemeResponseDto> {
  return unwrapApiResult<ConcessionSchemeResponseDto>(
    await apiClient.PATCH("/api/v1/billing/concession-schemes/{id}", { params: { path: { id } }, body: dto }),
  );
}

export async function deactivateConcessionScheme(id: string): Promise<ConcessionSchemeResponseDto> {
  return unwrapApiResult<ConcessionSchemeResponseDto>(
    await apiClient.POST("/api/v1/billing/concession-schemes/{id}/deactivate", { params: { path: { id } } }),
  );
}

export async function activateConcessionScheme(id: string): Promise<ConcessionSchemeResponseDto> {
  return unwrapApiResult<ConcessionSchemeResponseDto>(
    await apiClient.POST("/api/v1/billing/concession-schemes/{id}/activate", { params: { path: { id } } }),
  );
}
