"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAcademyLink, registerAcademyLink, testAcademyLink } from "../api/academy-link.api";

export const ACADEMY_LINK_QUERY_KEY = ["academy-sync", "link"] as const;

/** Not retried — a 403 (no permission to look) should simply render as "can't check". */
export function useAcademyLink() {
  return useQuery({ queryKey: ACADEMY_LINK_QUERY_KEY, queryFn: getAcademyLink, retry: false });
}

/** Tells the Academy this ERP's address (and rotates the shared secret). The server's own validation message is shown on failure. */
export function useRegisterAcademyLink() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successKey: "academySync.link.toast.registered" },
    mutationFn: (erpBaseUrl: string) => registerAcademyLink(erpBaseUrl),
    onSuccess: (data) => queryClient.setQueryData(ACADEMY_LINK_QUERY_KEY, data),
  });
}

/**
 * Asks the Academy to call this ERP and report. A failed TEST is a normal result (shown on the card), not an error, so
 * only a request that could not be made at all raises the error toast.
 */
export function useTestAcademyLink() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { toast: false },
    mutationFn: () => testAcademyLink(),
    onSuccess: (data) => queryClient.setQueryData(ACADEMY_LINK_QUERY_KEY, data),
  });
}
