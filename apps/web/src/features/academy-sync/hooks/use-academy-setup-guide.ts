"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAcademySetupGuide, setPaymentsCashier } from "../api/academy-setup-guide.api";

export const ACADEMY_SETUP_GUIDE_QUERY_KEY = ["academy-sync", "setup-guide"] as const;

/**
 * The setup guide is worked out by the server from the real state, so it is read afresh instead of kept:
 *  - when the person comes back to the tab (they may just have set something up on another page — Branding, Integrations...),
 *  - and right after ANY save on this page (switching publishing on, registering the address, choosing a user...), so a step
 *    turns "Done" the moment it is.
 * Not retried — a 403 (no permission to look) simply hides the guide.
 */
export function useAcademySetupGuide() {
  const queryClient = useQueryClient();
  React.useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "success") {
          void queryClient.invalidateQueries({ queryKey: ACADEMY_SETUP_GUIDE_QUERY_KEY });
        }
      }),
    [queryClient],
  );
  return useQuery({
    queryKey: ACADEMY_SETUP_GUIDE_QUERY_KEY,
    queryFn: getAcademySetupGuide,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useSetPaymentsCashier() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successKey: "license.setupGuide.cashier.saved" },
    mutationFn: (userId: string) => setPaymentsCashier(userId),
    onSuccess: (data) => queryClient.setQueryData(ACADEMY_SETUP_GUIDE_QUERY_KEY, data),
  });
}
