"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAcademyParentInvoicing, setAcademyParentInvoicing } from "../api/academy-parent-invoicing.api";

export const ACADEMY_PARENT_INVOICING_QUERY_KEY = ["academy-sync", "parent-invoicing"] as const;

/** Not retried — a 403 (no permission to look) should simply render as "can't check". */
export function useAcademyParentInvoicing() {
  return useQuery({ queryKey: ACADEMY_PARENT_INVOICING_QUERY_KEY, queryFn: getAcademyParentInvoicing, retry: false });
}

export function useSetAcademyParentInvoicing() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successKey: "academySync.parentInvoicing.toast.saved" },
    mutationFn: (input: { enabled: boolean; notifyRoleIds?: string[]; actorUserId?: string }) => setAcademyParentInvoicing(input),
    onSuccess: (data) => queryClient.setQueryData(ACADEMY_PARENT_INVOICING_QUERY_KEY, data),
  });
}
