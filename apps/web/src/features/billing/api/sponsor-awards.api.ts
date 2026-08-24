import type { CreateSponsorAwardDto, SponsorAwardResponseDto, UpdateSponsorAwardDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Part 3 (Billing sub-features batch) — thin wrapper over
 * `SponsorAwardsController`
 * (`packages/server/src/domains/billing/api/sponsor-awards.controller.ts`)
 * — `POST/GET(?studentId=)/GET:id/PATCH`, permissions
 * `billing:sponsor-award:manage`/`:view`. **No delete endpoint exists**
 * (confirmed by reading the controller — only 4 routes). `PATCH` only
 * accepts `amount`/`categoryScope` (`UpdateSponsorAwardDto`) — `sponsorId`/
 * `studentId`/`termId` are immutable once created.
 *
 * `appliedAmount` on the response is incremented automatically and silently
 * by the backend every time an invoice for this student+term posts
 * (`InvoicingService`'s Step 3 sponsor-award sweep, FR-BILL-042.1/
 * BR-BILL-13) — there is no "apply" action anywhere in this module to wrap.
 * `listSponsorAwardsForStudent` requires `studentId` (the controller has no
 * unscoped list route).
 */
export async function listSponsorAwardsForStudent(studentId: string): Promise<SponsorAwardResponseDto[]> {
  return unwrapApiResult<SponsorAwardResponseDto[]>(
    await apiClient.GET("/api/v1/billing/sponsor-awards", { params: { query: { studentId } } }),
  );
}

export async function getSponsorAward(id: string): Promise<SponsorAwardResponseDto> {
  return unwrapApiResult<SponsorAwardResponseDto>(
    await apiClient.GET("/api/v1/billing/sponsor-awards/{id}", { params: { path: { id } } }),
  );
}

export async function createSponsorAward(dto: CreateSponsorAwardDto): Promise<SponsorAwardResponseDto> {
  return unwrapApiResult<SponsorAwardResponseDto>(await apiClient.POST("/api/v1/billing/sponsor-awards", { body: dto }));
}

export async function updateSponsorAward(id: string, dto: UpdateSponsorAwardDto): Promise<SponsorAwardResponseDto> {
  return unwrapApiResult<SponsorAwardResponseDto>(
    await apiClient.PATCH("/api/v1/billing/sponsor-awards/{id}", { params: { path: { id } }, body: dto }),
  );
}
