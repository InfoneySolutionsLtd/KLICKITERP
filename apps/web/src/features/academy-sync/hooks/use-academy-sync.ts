"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAcademySyncStatus,
  setAcademyAutoSync,
  startAcademySyncRun,
  type StartAcademySyncRunDto,
} from "../api/academy-sync.api";

export const ACADEMY_SYNC_QUERY_KEY = ["academy-sync"] as const;

/**
 * Where the sync stands. While a run is going the status is re-read every 2 s so the card shows it finish; otherwise
 * it is read once (and again whenever a mutation below invalidates it). Not retried — a 403 (no permission to look)
 * should simply render as "can't check".
 */
export function useAcademySyncStatus() {
  return useQuery({
    queryKey: [...ACADEMY_SYNC_QUERY_KEY, "status"] as const,
    queryFn: getAcademySyncStatus,
    retry: false,
    refetchInterval: (query) => (query.state.data?.runningRun ? 2000 : false),
  });
}

/** Starts a preview or an import. The server answers at once; `useAcademySyncStatus` then polls until the run finishes. */
export function useStartAcademySyncRun() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { toast: false },
    mutationFn: (body: StartAcademySyncRunDto) => startAcademySyncRun(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACADEMY_SYNC_QUERY_KEY }),
  });
}

export function useSetAcademyAutoSync() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successKey: "academySync.toast.autoSyncSaved" },
    mutationFn: (enabled: boolean) => setAcademyAutoSync(enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACADEMY_SYNC_QUERY_KEY }),
  });
}
