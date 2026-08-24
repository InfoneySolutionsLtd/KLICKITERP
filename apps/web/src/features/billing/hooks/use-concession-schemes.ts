"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateConcessionSchemeDto, UpdateConcessionSchemeDto } from "@klickit/contracts";
import {
  activateConcessionScheme,
  createConcessionScheme,
  deactivateConcessionScheme,
  getConcessionScheme,
  listConcessionSchemes,
  updateConcessionScheme,
} from "../api/concession-schemes.api";

export const CONCESSION_SCHEMES_QUERY_KEY = ["billing", "concession-schemes"] as const;

function detailKey(id: string) {
  return [...CONCESSION_SCHEMES_QUERY_KEY, "detail", id] as const;
}

export function useConcessionSchemes() {
  return useQuery({
    queryKey: CONCESSION_SCHEMES_QUERY_KEY,
    queryFn: listConcessionSchemes,
  });
}

export function useConcessionScheme(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getConcessionScheme(id),
    enabled: !!id,
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: CONCESSION_SCHEMES_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateConcessionScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateConcessionSchemeDto) => createConcessionScheme(dto),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateConcessionScheme(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateConcessionSchemeDto) => updateConcessionScheme(id, dto),
    onSuccess: () => invalidate(queryClient, id),
  });
}

/** No delete endpoint exists on this controller (confirmed by reading it) — activate/deactivate toggle only, same shape as Fee Categories. */
export function useDeactivateConcessionScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateConcessionScheme(id),
    onSuccess: (_data, id) => invalidate(queryClient, id),
  });
}

export function useActivateConcessionScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateConcessionScheme(id),
    onSuccess: (_data, id) => invalidate(queryClient, id),
  });
}
