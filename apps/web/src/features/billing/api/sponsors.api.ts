import type { CreateSponsorDto, SponsorResponseDto, UpdateSponsorDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `SponsorsController`
 * (`packages/server/src/domains/billing/api/sponsors.controller.ts`) —
 * `POST/GET/GET:id/PATCH`, permissions `billing:sponsor:manage`/`:view`.
 * **No delete, no activate/deactivate at all** (confirmed by reading the
 * controller — only 4 routes exist) — a sponsor is permanent once created,
 * unlike every other reference table in this batch.
 */
export async function listSponsors(): Promise<SponsorResponseDto[]> {
  return unwrapApiResult<SponsorResponseDto[]>(await apiClient.GET("/api/v1/billing/sponsors"));
}

export async function getSponsor(id: string): Promise<SponsorResponseDto> {
  return unwrapApiResult<SponsorResponseDto>(await apiClient.GET("/api/v1/billing/sponsors/{id}", { params: { path: { id } } }));
}

export async function createSponsor(dto: CreateSponsorDto): Promise<SponsorResponseDto> {
  return unwrapApiResult<SponsorResponseDto>(await apiClient.POST("/api/v1/billing/sponsors", { body: dto }));
}

export async function updateSponsor(id: string, dto: UpdateSponsorDto): Promise<SponsorResponseDto> {
  return unwrapApiResult<SponsorResponseDto>(
    await apiClient.PATCH("/api/v1/billing/sponsors/{id}", { params: { path: { id } }, body: dto }),
  );
}
