"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateSponsorAwardDto, UpdateSponsorAwardDto } from "@klickit/contracts";
import { createSponsorAward, getSponsorAward, listSponsorAwardsForStudent, updateSponsorAward } from "../api/sponsor-awards.api";

/**
 * Part 3 (Billing sub-features batch) — TanStack Query wrapper over
 * `sponsor-awards.api.ts`, mirroring `use-late-fee-policies.ts`'s shape
 * (one `..._QUERY_KEY` const + scoped key-builders, mutations invalidating
 * on success). The list is keyed by `studentId` (the controller has no
 * unscoped list route — see the api file's own doc comment), not a single
 * flat key, since this is always used from one student's detail page and
 * different students' award lists must never share a cache entry.
 */
export const SPONSOR_AWARDS_QUERY_KEY = ["billing", "sponsor-awards"] as const;

export function sponsorAwardsListKey(studentId: string) {
  return [...SPONSOR_AWARDS_QUERY_KEY, "student", studentId] as const;
}

function detailKey(id: string) {
  return [...SPONSOR_AWARDS_QUERY_KEY, "detail", id] as const;
}

export function useSponsorAwardsForStudent(studentId: string) {
  return useQuery({
    queryKey: sponsorAwardsListKey(studentId),
    queryFn: () => listSponsorAwardsForStudent(studentId),
    enabled: !!studentId,
  });
}

export function useSponsorAward(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getSponsorAward(id),
    enabled: !!id,
  });
}

export function useCreateSponsorAward(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSponsorAwardDto) => createSponsorAward(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sponsorAwardsListKey(studentId) }),
  });
}

/** No delete endpoint exists on this controller (see `sponsor-awards.api.ts`'s own doc comment) — `update()` (amount/categoryScope only) is the only mutation besides create. Not currently wired to any UI in this pass (the plan scopes this part to a create-only dialog), kept here for parity with `use-late-fee-policies.ts`'s shape and ready for a future edit flow. */
export function useUpdateSponsorAward(id: string, studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateSponsorAwardDto) => updateSponsorAward(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sponsorAwardsListKey(studentId) });
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
    },
  });
}
