"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBankExternalTransferDto } from "@klickit/contracts";
import {
  approveExternalTransfer,
  createExternalTransfer,
  getExternalTransfer,
  listExternalTransfers,
  postExternalTransfer,
  rejectExternalTransfer,
  submitExternalTransfer,
  updateExternalTransferReference,
  type BankExternalTransferResponseDto,
  type ListExternalTransfersFilters,
} from "../api/external-transfers.api";

/** `["banking", "external-transfers"]` query-key convention, mirroring `use-transfers.ts`'s own shape exactly. */
export const BANKING_EXTERNAL_TRANSFERS_QUERY_KEY = ["banking", "external-transfers"] as const;

function listKey(filters: ListExternalTransfersFilters) {
  return [...BANKING_EXTERNAL_TRANSFERS_QUERY_KEY, "list", filters] as const;
}

function detailKey(id: string | undefined) {
  return [...BANKING_EXTERNAL_TRANSFERS_QUERY_KEY, "detail", id] as const;
}

export function useExternalTransfers(filters: ListExternalTransfersFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listExternalTransfers(filters) });
}

export function useExternalTransfer(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getExternalTransfer(id as string), enabled: !!id });
}

function invalidateExternalTransferQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: BANKING_EXTERNAL_TRANSFERS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateExternalTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateBankExternalTransferDto) => createExternalTransfer(dto),
    onSuccess: (created) => invalidateExternalTransferQueries(queryClient, created.id),
  });
}

export function useUpdateExternalTransferReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, referenceNo }: { id: string; referenceNo: string }) => updateExternalTransferReference(id, referenceNo),
    onSuccess: (updated) => invalidateExternalTransferQueries(queryClient, updated.id),
  });
}

export function useSubmitExternalTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitExternalTransfer(id),
    onSuccess: (updated) => invalidateExternalTransferQueries(queryClient, updated.id),
  });
}

export function useApproveExternalTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveExternalTransfer(id),
    onSuccess: (updated) => invalidateExternalTransferQueries(queryClient, updated.id),
  });
}

export function useRejectExternalTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectExternalTransfer(id),
    onSuccess: (updated) => invalidateExternalTransferQueries(queryClient, updated.id),
  });
}

export function usePostExternalTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postExternalTransfer(id),
    onSuccess: (updated) => invalidateExternalTransferQueries(queryClient, updated.id),
  });
}

export type { BankExternalTransferResponseDto };
export { BANK_EXTERNAL_TRANSFER_STATUSES, isDraftPlaceholderNumber } from "../api/external-transfers.api";
export type { BankExternalTransferStatus, ListExternalTransfersFilters } from "../api/external-transfers.api";
