"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateSponsorDto, UpdateSponsorDto } from "@klickit/contracts";
import { createSponsor, getSponsor, listSponsors, updateSponsor } from "../api/sponsors.api";

export const SPONSORS_QUERY_KEY = ["billing", "sponsors"] as const;

function detailKey(id: string) {
  return [...SPONSORS_QUERY_KEY, "detail", id] as const;
}

export function useSponsors() {
  return useQuery({
    queryKey: SPONSORS_QUERY_KEY,
    queryFn: listSponsors,
  });
}

export function useSponsor(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getSponsor(id),
    enabled: !!id,
  });
}

export function useCreateSponsor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSponsorDto) => createSponsor(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPONSORS_QUERY_KEY }),
  });
}

export function useUpdateSponsor(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateSponsorDto) => updateSponsor(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SPONSORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
    },
  });
}
