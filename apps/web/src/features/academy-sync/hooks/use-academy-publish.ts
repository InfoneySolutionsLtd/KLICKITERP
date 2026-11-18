"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAcademyPublish, runAcademyPublish, setAcademyPublish } from "../api/academy-publish.api";

export const ACADEMY_PUBLISH_QUERY_KEY = ["academy-sync", "publish"] as const;

/**
 * Re-read every 15 s while publishing is on, so the "waiting" count drains on screen as the worker sends invoices.
 * Not retried — a 403 (no permission to look) should simply render as "can't check".
 */
export function useAcademyPublish() {
  return useQuery({
    queryKey: ACADEMY_PUBLISH_QUERY_KEY,
    queryFn: getAcademyPublish,
    retry: false,
    refetchInterval: (query) => (query.state.data?.enabled ? 15_000 : false),
  });
}

export function useSetAcademyPublish() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successKey: "academySync.publish.toast.saved" },
    mutationFn: (enabled: boolean) => setAcademyPublish(enabled),
    onSuccess: (data) => queryClient.setQueryData(ACADEMY_PUBLISH_QUERY_KEY, data),
  });
}

export function useRunAcademyPublish() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successKey: "academySync.publish.toast.ran" },
    mutationFn: () => runAcademyPublish(),
    onSuccess: (data) => queryClient.setQueryData(ACADEMY_PUBLISH_QUERY_KEY, data),
  });
}
