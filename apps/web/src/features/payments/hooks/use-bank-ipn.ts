"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBankIpnReadiness, listBankIpn, setBankIpnCashier, type ListBankIpnParams } from "../api/bank-ipn.api";

export const BANK_IPN_QUERY_KEY = ["payments", "bank-ipn"] as const;

/** Server-paginated — `params` is the whole key, so a page / filter change is its own cache entry. */
export function useBankIpnList(params: ListBankIpnParams = {}) {
  return useQuery({ queryKey: [...BANK_IPN_QUERY_KEY, "list", params], queryFn: () => listBankIpn(params) });
}

/** Whether a receipting cashier is set. Not retried: a 403 (no permission to look) should simply show "can't check". */
export function useBankIpnReadiness() {
  return useQuery({ queryKey: [...BANK_IPN_QUERY_KEY, "readiness"], queryFn: getBankIpnReadiness, retry: false });
}

export function useSetBankIpnCashier() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successKey: "payments.bankNotifications.cashier.saved" },
    mutationFn: (userId: string) => setBankIpnCashier(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...BANK_IPN_QUERY_KEY, "readiness"] }),
  });
}
