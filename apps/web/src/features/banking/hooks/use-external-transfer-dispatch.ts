"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dispatchTransfer,
  listTransferDispatches,
  resolveDispatch,
  type DispatchExternalTransferDto,
  type ResolveDispatchDto,
} from "../api/external-transfer-dispatch.api";
import { BANKING_EXTERNAL_TRANSFERS_QUERY_KEY } from "./use-external-transfers";

function dispatchesKey(transferId: string | undefined) {
  return [...BANKING_EXTERNAL_TRANSFERS_QUERY_KEY, "dispatches", transferId] as const;
}

export function useTransferDispatches(transferId: string | undefined) {
  return useQuery({ queryKey: dispatchesKey(transferId), queryFn: () => listTransferDispatches(transferId as string), enabled: !!transferId });
}

/**
 * The API answers 201 even when the bank said no, or said nothing — the outcome is in the returned row's `status`.
 * So no generic "done" toast here (`toast: false`): the dialog reports the real outcome itself (sent / refused /
 * unknown), and a green line must never appear over a payment that did not go through.
 */
export function useDispatchTransfer(transferId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { toast: false },
    mutationFn: (body: DispatchExternalTransferDto) => dispatchTransfer(transferId, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: dispatchesKey(transferId) }),
  });
}

export function useResolveDispatch(transferId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { toast: "updated" },
    mutationFn: ({ dispatchId, body }: { dispatchId: string; body: ResolveDispatchDto }) => resolveDispatch(transferId, dispatchId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dispatchesKey(transferId) }),
  });
}
