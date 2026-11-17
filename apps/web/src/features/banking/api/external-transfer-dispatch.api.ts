import type { BankExternalTransferDispatchResponseDto, DispatchExternalTransferDto, ResolveDispatchDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

export type { BankExternalTransferDispatchResponseDto, DispatchExternalTransferDto, ResolveDispatchDto };

/**
 * Sending an approved external transfer through the bank's API (KCB Funds Transfer) — thin wrapper over
 * `ExternalTransferDispatchController` (`.../banking/external-transfers/:id/dispatches`). Listing needs the same
 * permission as the transfer (`banking:external-transfer:create`); SENDING and resolving need the separate admin-only
 * `banking:external-transfer:dispatch`.
 */
export const BANK_DISPATCH_ACTIVE_STATUSES = ["PENDING", "SENT", "UNKNOWN"] as const;

export async function listTransferDispatches(transferId: string): Promise<BankExternalTransferDispatchResponseDto[]> {
  return unwrapApiResult<BankExternalTransferDispatchResponseDto[]>(
    await apiClient.GET("/api/v1/banking/external-transfers/{id}/dispatches", { params: { path: { id: transferId } } }),
  );
}

export async function dispatchTransfer(transferId: string, body: DispatchExternalTransferDto): Promise<BankExternalTransferDispatchResponseDto> {
  return unwrapApiResult<BankExternalTransferDispatchResponseDto>(
    await apiClient.POST("/api/v1/banking/external-transfers/{id}/dispatches", { params: { path: { id: transferId } }, body }),
  );
}

export async function resolveDispatch(transferId: string, dispatchId: string, body: ResolveDispatchDto): Promise<BankExternalTransferDispatchResponseDto> {
  return unwrapApiResult<BankExternalTransferDispatchResponseDto>(
    await apiClient.POST("/api/v1/banking/external-transfers/{id}/dispatches/{dispatchId}/resolve", {
      params: { path: { id: transferId, dispatchId } },
      body,
    }),
  );
}
