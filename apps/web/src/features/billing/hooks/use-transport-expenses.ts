"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LogTransportExpenseDto } from "@klickit/contracts";
import { getTransportRouteSummary, listTransportExpenses, logTransportExpense } from "../api/transport-expenses.api";

export const TRANSPORT_EXPENSES_QUERY_KEY = ["billing", "transport-expenses"] as const;
export const TRANSPORT_ROUTE_SUMMARY_QUERY_KEY = ["billing", "transport-route-summary"] as const;

export function useTransportExpenses(routeId: string) {
  return useQuery({
    queryKey: [...TRANSPORT_EXPENSES_QUERY_KEY, routeId],
    queryFn: () => listTransportExpenses(routeId),
    enabled: !!routeId,
  });
}

export function useTransportRouteSummary(routeId: string) {
  return useQuery({
    queryKey: [...TRANSPORT_ROUTE_SUMMARY_QUERY_KEY, routeId],
    queryFn: () => getTransportRouteSummary(routeId),
    enabled: !!routeId,
  });
}

export function useLogTransportExpense(routeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: LogTransportExpenseDto) => logTransportExpense(routeId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...TRANSPORT_EXPENSES_QUERY_KEY, routeId] });
      queryClient.invalidateQueries({ queryKey: [...TRANSPORT_ROUTE_SUMMARY_QUERY_KEY, routeId] });
    },
  });
}
