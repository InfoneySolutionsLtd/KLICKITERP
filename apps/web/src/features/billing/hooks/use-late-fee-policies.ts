"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateLateFeePolicyDto, UpdateLateFeePolicyDto } from "@klickit/contracts";
import {
  activateLateFeePolicy,
  createLateFeePolicy,
  deactivateLateFeePolicy,
  getLateFeePolicy,
  listLateFeePolicies,
  updateLateFeePolicy,
} from "../api/late-fee-policies.api";

export const LATE_FEE_POLICIES_QUERY_KEY = ["billing", "late-fee-policies"] as const;
export const lateFeePolicyDetailKey = (id: string) => [...LATE_FEE_POLICIES_QUERY_KEY, id] as const;

export function useLateFeePolicies() {
  return useQuery({
    queryKey: LATE_FEE_POLICIES_QUERY_KEY,
    queryFn: listLateFeePolicies,
  });
}

export function useLateFeePolicy(id: string) {
  return useQuery({
    queryKey: lateFeePolicyDetailKey(id),
    queryFn: () => getLateFeePolicy(id),
    enabled: !!id,
  });
}

export function useCreateLateFeePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateLateFeePolicyDto) => createLateFeePolicy(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LATE_FEE_POLICIES_QUERY_KEY }),
  });
}

export function useUpdateLateFeePolicy(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateLateFeePolicyDto) => updateLateFeePolicy(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LATE_FEE_POLICIES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: lateFeePolicyDetailKey(id) });
    },
  });
}

export function useDeactivateLateFeePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateLateFeePolicy(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: LATE_FEE_POLICIES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: lateFeePolicyDetailKey(id) });
    },
  });
}

export function useActivateLateFeePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateLateFeePolicy(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: LATE_FEE_POLICIES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: lateFeePolicyDetailKey(id) });
    },
  });
}
