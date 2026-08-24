import type { CreateLateFeePolicyDto, LateFeePolicyResponseDto, UpdateLateFeePolicyDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `LateFeePoliciesController`
 * (`packages/server/src/domains/billing/api/late-fee-policies.controller.ts`) —
 * `POST/GET/GET:id/PATCH/:id/deactivate/:id/activate`, permissions
 * `billing:late-fee-policy:manage`/`:view`, mirroring `fee-categories.api.ts`'s
 * shape exactly. `UpdateLateFeePolicyDto` has no `name` field at all (confirmed
 * by reading `late-fee-policy.dto.ts`) — a policy's name cannot be renamed
 * after creation, so `updateLateFeePolicy()` only ever sends `mode`/`params`/
 * `graceDays`/`requiresApproval`.
 */
export async function listLateFeePolicies(): Promise<LateFeePolicyResponseDto[]> {
  return unwrapApiResult<LateFeePolicyResponseDto[]>(await apiClient.GET("/api/v1/billing/late-fee-policies"));
}

export async function getLateFeePolicy(id: string): Promise<LateFeePolicyResponseDto> {
  return unwrapApiResult<LateFeePolicyResponseDto>(
    await apiClient.GET("/api/v1/billing/late-fee-policies/{id}", { params: { path: { id } } }),
  );
}

export async function createLateFeePolicy(dto: CreateLateFeePolicyDto): Promise<LateFeePolicyResponseDto> {
  return unwrapApiResult<LateFeePolicyResponseDto>(await apiClient.POST("/api/v1/billing/late-fee-policies", { body: dto }));
}

export async function updateLateFeePolicy(id: string, dto: UpdateLateFeePolicyDto): Promise<LateFeePolicyResponseDto> {
  return unwrapApiResult<LateFeePolicyResponseDto>(
    await apiClient.PATCH("/api/v1/billing/late-fee-policies/{id}", { params: { path: { id } }, body: dto }),
  );
}

export async function deactivateLateFeePolicy(id: string): Promise<LateFeePolicyResponseDto> {
  return unwrapApiResult<LateFeePolicyResponseDto>(
    await apiClient.POST("/api/v1/billing/late-fee-policies/{id}/deactivate", { params: { path: { id } } }),
  );
}

export async function activateLateFeePolicy(id: string): Promise<LateFeePolicyResponseDto> {
  return unwrapApiResult<LateFeePolicyResponseDto>(
    await apiClient.POST("/api/v1/billing/late-fee-policies/{id}/activate", { params: { path: { id } } }),
  );
}
