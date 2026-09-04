import type { CreateDelegationDto, UpdateDelegationDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { Delegation } from "../types";

/**
 * Thin wrapper over `DelegationsController`
 * (`packages/server/src/platform/approvals/api/delegations.controller.ts`).
 * `approvals:delegation:view` covers list/get, `approvals:delegation:manage`
 * covers create/update/delete. `fromUserId`/`toUserId` are immutable after
 * creation (not part of `UpdateDelegationDto`) — changing the delegate means
 * delete + recreate, no dedicated "replace" wrapper needed for that.
 */
export async function listDelegations(): Promise<Delegation[]> {
  return unwrapApiResult<Delegation[]>(await apiClient.GET("/api/v1/approvals/delegations"));
}

export async function getDelegation(id: string): Promise<Delegation> {
  return unwrapApiResult<Delegation>(
    await apiClient.GET("/api/v1/approvals/delegations/{id}", { params: { path: { id } } }),
  );
}

export async function createDelegation(dto: CreateDelegationDto): Promise<Delegation> {
  return unwrapApiResult<Delegation>(await apiClient.POST("/api/v1/approvals/delegations", { body: dto }));
}

/**
 * `reason` is `@ApiPropertyOptional({nullable: true})` server-side (a real
 * `string | null` field, confirmed by reading `update-delegation.dto.ts`
 * directly) with no explicit `type` — `@nestjs/swagger` renders this as an
 * unusable `({} & {[x: string]: undefined}) | null | undefined` phantom
 * type in the generated OpenAPI body (a real string value satisfies none of
 * its 3 members), a strictly worse manifestation of the same
 * missing-`type`-on-`nullable` gap `wallets.api.ts`'s own
 * `UpdateWalletLimitsRequestBody` documents. `UpdateDelegationRequestBody`
 * documents/validates the REAL intended shape (assigning `dto` to it below
 * confirms the two agree); the final `as never` is what actually gets past
 * the broken generated type — `never` being a subtype of everything, it's
 * accepted at any call-argument position no matter how garbled the
 * generated type is.
 */
interface UpdateDelegationRequestBody {
  startsOn?: string;
  endsOn?: string;
  reason?: string | null;
}

export async function updateDelegation(id: string, dto: UpdateDelegationDto): Promise<Delegation> {
  const body: UpdateDelegationRequestBody = dto;
  return unwrapApiResult<Delegation>(
    await apiClient.PATCH("/api/v1/approvals/delegations/{id}", { params: { path: { id } }, body: body as never }),
  );
}

export async function deleteDelegation(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/approvals/delegations/{id}", { params: { path: { id } } });
  unwrapApiResult<{ deleted: true }>(result);
}
