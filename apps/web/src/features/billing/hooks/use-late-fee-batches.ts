"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DecideLateFeeBatchDto, RunLateFeeBatchDto } from "@klickit/contracts";
import {
  decideLateFeeBatch,
  getLateFeeBatch,
  listLateFeeBatches,
  parseLateFeeBatchSummary,
  postLateFeeBatch,
  runLateFeeBatch,
} from "../api/late-fee-batches.api";
import { studentInvoicesKey } from "./use-invoices";

export const LATE_FEE_BATCHES_QUERY_KEY = ["billing", "late-fee-batches"] as const;

function listKey(policyId: string | undefined) {
  return [...LATE_FEE_BATCHES_QUERY_KEY, "list", policyId] as const;
}

function detailKey(id: string | undefined) {
  return [...LATE_FEE_BATCHES_QUERY_KEY, "detail", id] as const;
}

/** `billing:late-fee-batch:view`-gated server-side; `policyId` is REQUIRED server-side (see `late-fee-batches.api.ts`'s own doc comment on `listLateFeeBatches()`) — this hook mirrors that by staying `enabled: false` until one is actually picked, backing the late-fee-batches list page's policy-scoped table, matching `use-budgets.ts`'s own `useBudgets(fiscalYearId)` shape. */
export function useLateFeeBatches(policyId: string | undefined) {
  return useQuery({
    queryKey: listKey(policyId),
    queryFn: () => listLateFeeBatches(policyId as string),
    enabled: !!policyId,
  });
}

export function useLateFeeBatch(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getLateFeeBatch(id as string),
    enabled: !!id,
  });
}

export function useRunLateFeeBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RunLateFeeBatchDto) => runLateFeeBatch(dto),
    onSuccess: (created) => queryClient.invalidateQueries({ queryKey: listKey(created.policyId) }),
  });
}

/**
 * Backs both the Approve dialog (`{approved:true}`, which posts the batch
 * immediately server-side — `onApprovalDecided()` calls `postInternal()`
 * directly, there is no distinct `APPROVED` state to land on first) and the
 * "Send back to Draft" dialog (`{approved:false}`, which reverts to `DRAFT`
 * — there is no `REJECTED` terminal state at all). On a transition INTO
 * `POSTED`, also cross-invalidates every affected student's own invoices
 * list + ledger (`invalidatePostedStudents()` below) — `postInternal()`
 * generates and posts one new `ADHOC` invoice per `(studentId, termId)`
 * entry in the batch's own `summary`, a real cross-entity side effect,
 * matching `use-invoices.ts`'s `usePostInvoice()` own
 * `["students","ledger",studentId]` invalidation.
 */
export function useDecideLateFeeBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecideLateFeeBatchDto }) => decideLateFeeBatch(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
      queryClient.invalidateQueries({ queryKey: listKey(updated.policyId) });
      if (updated.status === "POSTED") {
        invalidatePostedStudents(queryClient, updated.summary);
      }
    },
  });
}

/** `post()` always lands on `POSTED` (its own doc comment: "only rejects an already-POSTED batch") — see `useDecideLateFeeBatch()`'s own doc comment for why this unconditionally cross-invalidates every affected student's invoices list + ledger. */
export function usePostLateFeeBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postLateFeeBatch(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
      queryClient.invalidateQueries({ queryKey: listKey(updated.policyId) });
      invalidatePostedStudents(queryClient, updated.summary);
    },
  });
}

function invalidatePostedStudents(queryClient: ReturnType<typeof useQueryClient>, summary: Record<string, unknown>) {
  const parsed = parseLateFeeBatchSummary(summary);
  const studentIds = new Set(parsed.entries.map((entry) => entry.studentId));
  for (const studentId of studentIds) {
    queryClient.invalidateQueries({ queryKey: studentInvoicesKey(studentId) });
    queryClient.invalidateQueries({ queryKey: ["students", "ledger", studentId] });
  }
}
