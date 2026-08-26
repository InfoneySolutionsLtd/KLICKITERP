"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REPORTS_QUERY_KEY } from "./use-catalogue";
import { createSavedParams, deleteSavedParams, getSavedParams, listMySavedParams, updateSavedParams } from "../api/saved-params.api";

function savedParamsListKey() {
  return [...REPORTS_QUERY_KEY, "saved-params", "list"] as const;
}

function savedParamsDetailKey(id: string | undefined) {
  return [...REPORTS_QUERY_KEY, "saved-params", "detail", id] as const;
}

export function useMySavedParams() {
  return useQuery({ queryKey: savedParamsListKey(), queryFn: listMySavedParams });
}

export function useSavedParams(id: string | undefined) {
  return useQuery({ queryKey: savedParamsDetailKey(id), queryFn: () => getSavedParams(id as string), enabled: !!id });
}

export function useCreateSavedParams() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportCode, name, params }: { reportCode: string; name: string; params: Record<string, unknown> }) =>
      createSavedParams(reportCode, name, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedParamsListKey() }),
  });
}

/** Backs both renaming (`{name}`, `RenameSavedParamsDialog`) and in-place param overwrite (`{params}`, `ReportDetailBody`'s "Update saved report" action). Invalidates the detail key too — `ReportDetailBody`'s own `useSavedParams(savedParamsId)` read (used only for its one-time hydration guard) should reflect the new saved values on a later re-fetch. */
export function useUpdateSavedParams() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, params }: { id: string; name?: string; params?: Record<string, unknown> }) =>
      updateSavedParams(id, { name, params }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: savedParamsListKey() });
      queryClient.invalidateQueries({ queryKey: savedParamsDetailKey(updated.id) });
    },
  });
}

export function useDeleteSavedParams() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedParams(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedParamsListKey() }),
  });
}
