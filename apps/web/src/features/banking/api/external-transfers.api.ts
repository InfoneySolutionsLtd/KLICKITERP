import type { BankExternalTransferResponseDto, CreateBankExternalTransferDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * P-35 (External Bank Transfer feature) — thin wrapper over
 * `ExternalTransfersController` (`packages/server/src/domains/banking/api/external-transfers.controller.ts`,
 * base `/api/v1/banking/external-transfers`), mirroring `transfers.api.ts`'s
 * own shape exactly. Same 3-permission split: `banking:external-transfer:create`
 * on create/list/get/submit/reference-patch, `:decide` on approve/reject,
 * `:post` on post alone.
 */
export type { BankExternalTransferResponseDto };

export const BANK_EXTERNAL_TRANSFER_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED"] as const;
export type BankExternalTransferStatus = (typeof BANK_EXTERNAL_TRANSFER_STATUSES)[number];

/** Same `DRAFT-<uuid>` placeholder shape as `bank_transfer.number` — see `transfers.api.ts`'s own `isDraftPlaceholderNumber()`. */
export function isDraftPlaceholderNumber(number: string): boolean {
  return number.startsWith("DRAFT-");
}

interface ExternalTransfersListQueryShape {
  status?: string;
  sourceAccountId?: string;
}

export interface ListExternalTransfersFilters {
  status?: BankExternalTransferStatus;
  sourceAccountId?: string;
}

export async function listExternalTransfers(
  filters: ListExternalTransfersFilters = {},
): Promise<BankExternalTransferResponseDto[]> {
  const query: ExternalTransfersListQueryShape = {};
  if (filters.status !== undefined) query.status = filters.status;
  if (filters.sourceAccountId !== undefined) query.sourceAccountId = filters.sourceAccountId;
  return unwrapApiResult<BankExternalTransferResponseDto[]>(
    await apiClient.GET("/api/v1/banking/external-transfers", {
      params: { query: query as unknown as Required<ExternalTransfersListQueryShape> },
    }),
  );
}

export async function getExternalTransfer(id: string): Promise<BankExternalTransferResponseDto> {
  return unwrapApiResult<BankExternalTransferResponseDto>(
    await apiClient.GET("/api/v1/banking/external-transfers/{id}", { params: { path: { id } } }),
  );
}

export async function createExternalTransfer(dto: CreateBankExternalTransferDto): Promise<BankExternalTransferResponseDto> {
  return unwrapApiResult<BankExternalTransferResponseDto>(
    await apiClient.POST("/api/v1/banking/external-transfers", { body: dto }),
  );
}

export async function updateExternalTransferReference(id: string, referenceNo: string): Promise<BankExternalTransferResponseDto> {
  return unwrapApiResult<BankExternalTransferResponseDto>(
    await apiClient.PATCH("/api/v1/banking/external-transfers/{id}/reference", { params: { path: { id } }, body: { referenceNo } }),
  );
}

export async function submitExternalTransfer(id: string): Promise<BankExternalTransferResponseDto> {
  return unwrapApiResult<BankExternalTransferResponseDto>(
    await apiClient.POST("/api/v1/banking/external-transfers/{id}/submit", { params: { path: { id } } }),
  );
}

export async function approveExternalTransfer(id: string): Promise<BankExternalTransferResponseDto> {
  return unwrapApiResult<BankExternalTransferResponseDto>(
    await apiClient.POST("/api/v1/banking/external-transfers/{id}/approve", { params: { path: { id } } }),
  );
}

export async function rejectExternalTransfer(id: string): Promise<BankExternalTransferResponseDto> {
  return unwrapApiResult<BankExternalTransferResponseDto>(
    await apiClient.POST("/api/v1/banking/external-transfers/{id}/reject", { params: { path: { id } } }),
  );
}

/** Realizes P-35's 2-or-4-line journal — see `bank-external-transfers.service.ts`'s own `post()` doc comment for the exact mechanism. */
export async function postExternalTransfer(id: string): Promise<BankExternalTransferResponseDto> {
  return unwrapApiResult<BankExternalTransferResponseDto>(
    await apiClient.POST("/api/v1/banking/external-transfers/{id}/post", { params: { path: { id } } }),
  );
}
