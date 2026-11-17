import type { BankIpnListResponseDto, BankIpnReadinessResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

export type BankIpnState = "RECEIVED" | "MATCHED" | "SUSPENDED";
export type BankIpnKind = "ACCOUNT" | "TILL";

export interface ListBankIpnParams {
  page?: number;
  pageSize?: number;
  state?: BankIpnState;
  kind?: BankIpnKind;
  q?: string;
}

/**
 * `GET /payments/bank-ipn` (`payments:suspense:manage`) — the log of payment notifications the bank has pushed to the
 * ERP, newest first, each with what became of it (receipt, or waiting in suspense with the reason).
 */
export async function listBankIpn(params: ListBankIpnParams = {}): Promise<BankIpnListResponseDto> {
  return unwrapApiResult<BankIpnListResponseDto>(
    await apiClient.GET("/api/v1/payments/bank-ipn", {
      params: {
        query: optionalQuery({
          page: params.page !== undefined ? String(params.page) : undefined,
          pageSize: params.pageSize !== undefined ? String(params.pageSize) : undefined,
          state: params.state,
          kind: params.kind,
          q: params.q,
        }),
      },
    }),
  );
}

/** `GET /payments/bank-ipn/readiness` (`settings:integration:manage`) — can bank payments be receipted automatically (is a receipting cashier set)? */
export async function getBankIpnReadiness(): Promise<BankIpnReadinessResponseDto> {
  return unwrapApiResult<BankIpnReadinessResponseDto>(await apiClient.GET("/api/v1/payments/bank-ipn/readiness"));
}

/** `PUT /payments/bank-ipn/cashier` (`settings:integration:manage`) — choose the user recorded as the cashier on receipts made from bank notifications. */
export async function setBankIpnCashier(userId: string): Promise<BankIpnReadinessResponseDto> {
  return unwrapApiResult<BankIpnReadinessResponseDto>(await apiClient.PUT("/api/v1/payments/bank-ipn/cashier", { body: { userId } }));
}
