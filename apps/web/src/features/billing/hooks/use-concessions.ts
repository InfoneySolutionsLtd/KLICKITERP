"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DecideConcessionDto, RequestConcessionDto } from "@klickit/contracts";
import {
  decideConcession,
  getConcession,
  listConcessionsByInvoice,
  listConcessionsByStudent,
  postStandaloneConcession,
  requestConcession,
} from "../api/concessions.api";
import { detailKey as invoiceDetailKey, studentInvoicesKey } from "./use-invoices";

/**
 * Part 4 (Billing sub-features batch) — TanStack Query wrapper over
 * `concessions.api.ts`, mirroring `use-credit-notes.ts`'s exact shape (one
 * `..._QUERY_KEY` const + scoped key-builders per surface, mutations
 * invalidating on success). A concession is reachable from BOTH a student's
 * own detail page (`useConcessionsByStudent`) and — when it targets an
 * invoice rather than a bare invoice line — an invoice's own detail page
 * (`useConcessionsByInvoice`), so every mutation below invalidates both
 * scoped list keys it might affect, not just one.
 */
export const CONCESSIONS_QUERY_KEY = ["billing", "concessions"] as const;

function studentConcessionsKey(studentId: string | undefined) {
  return [...CONCESSIONS_QUERY_KEY, "student", studentId] as const;
}
function invoiceConcessionsKey(invoiceId: string | undefined) {
  return [...CONCESSIONS_QUERY_KEY, "invoice", invoiceId] as const;
}
function detailKey(id: string | undefined) {
  return [...CONCESSIONS_QUERY_KEY, "detail", id] as const;
}

export function useConcessionsByStudent(studentId: string | undefined) {
  return useQuery({
    queryKey: studentConcessionsKey(studentId),
    queryFn: () => listConcessionsByStudent(studentId as string),
    enabled: !!studentId,
  });
}

export function useConcessionsByInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: invoiceConcessionsKey(invoiceId),
    queryFn: () => listConcessionsByInvoice(invoiceId as string),
    enabled: !!invoiceId,
  });
}

export function useConcession(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getConcession(id as string),
    enabled: !!id,
  });
}

/**
 * `RequestConcessionDialog` always knows the concession's own `studentId`
 * (required on every mode) and, when invoice-scoped (either launched
 * pre-filled from the invoice detail page, or student-scoped with an invoice
 * picked from a combobox), the target `invoiceId` too — both are passed here
 * so a fresh request invalidates whichever list(s) it could actually appear
 * in without an extra round trip to re-derive them from the mutation result.
 */
export function useRequestConcession(studentId: string | undefined, invoiceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RequestConcessionDto) => requestConcession(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentConcessionsKey(studentId) });
      if (invoiceId) queryClient.invalidateQueries({ queryKey: invoiceConcessionsKey(invoiceId) });
    },
  });
}

/**
 * `ConcessionStatusActions` is context-independent (renders off the
 * concession's own fields alone, safe on both surfaces per the plan) — its
 * `studentId`/`invoiceId` args below come straight from the concession
 * object itself (`concession.studentId`/`concession.invoiceId`), not from
 * page context, so this hook stays usable from either surface without the
 * caller threading anything extra through.
 */
export function useDecideConcession(studentId: string | undefined, invoiceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecideConcessionDto }) => decideConcession(id, dto),
    onSuccess: (concession) => {
      queryClient.invalidateQueries({ queryKey: detailKey(concession.id) });
      queryClient.invalidateQueries({ queryKey: studentConcessionsKey(studentId) });
      if (invoiceId) queryClient.invalidateQueries({ queryKey: invoiceConcessionsKey(invoiceId) });
    },
  });
}

/**
 * `ConcessionsService.postStandalone()` — see that class's own doc comment
 * ("postStandalone — the frozen-invoice-columns design decision") — directly
 * mutates the target invoice's own `paidAmount`/`balance`/`status` and
 * appends a real `std_ledger_entry` row, the exact same real invoice-side
 * effect `CreditNotesService.post()` has. Mirrors `usePostCreditNote()`'s
 * (`use-credit-notes.ts`) exact invalidation set for that reason: the
 * concession's own keys, the invoice's own detail key (`use-invoices.ts`'s
 * exported `detailKey`, reused here rather than reconstructing the tuple
 * shape), the student's invoice list, and the student's ledger.
 */
export function usePostStandaloneConcession(studentId: string | undefined, invoiceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postStandaloneConcession(id),
    onSuccess: (concession) => {
      queryClient.invalidateQueries({ queryKey: detailKey(concession.id) });
      queryClient.invalidateQueries({ queryKey: invoiceConcessionsKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: invoiceDetailKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: studentInvoicesKey(studentId) });
      queryClient.invalidateQueries({ queryKey: ["students", "ledger", studentId] });
    },
  });
}
