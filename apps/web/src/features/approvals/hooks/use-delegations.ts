"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateDelegationDto, UpdateDelegationDto } from "@klickit/contracts";
import { createDelegation, deleteDelegation, getDelegation, listDelegations, updateDelegation } from "../api/delegations.api";

export const DELEGATIONS_QUERY_KEY = ["approvals", "delegations"] as const;

function detailKey(id: string | undefined) {
  return [...DELEGATIONS_QUERY_KEY, "detail", id] as const;
}

/** `approvals:delegation:view`-gated server-side; the real handler has no filters, small unbounded dataset (same shape as Roles/Delegations' own list precedent) — filter client-side if a screen ever needs it. */
export function useDelegations() {
  return useQuery({ queryKey: DELEGATIONS_QUERY_KEY, queryFn: listDelegations });
}

export function useDelegation(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getDelegation(id as string), enabled: !!id });
}

export function useCreateDelegation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateDelegationDto) => createDelegation(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DELEGATIONS_QUERY_KEY }),
  });
}

export function useUpdateDelegation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateDelegationDto }) => updateDelegation(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: DELEGATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

export function useDeleteDelegation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDelegation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DELEGATIONS_QUERY_KEY }),
  });
}
