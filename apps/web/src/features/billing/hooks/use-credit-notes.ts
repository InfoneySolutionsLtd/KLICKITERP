"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCreditNoteDto, DecideCreditNoteDto } from "@klickit/contracts";
import {
  createCreditNote,
  decideCreditNote,
  getCreditNote,
  listCreditNoteLines,
  listCreditNotesByInvoice,
  postCreditNote,
  submitCreditNote,
} from "../api/credit-notes.api";
import { detailKey as invoiceDetailKey, studentInvoicesKey } from "./use-invoices";

export const CREDIT_NOTES_QUERY_KEY = ["billing", "credit-notes"] as const;

function invoiceCreditNotesKey(invoiceId: string | undefined) {
  return [...CREDIT_NOTES_QUERY_KEY, "invoice", invoiceId] as const;
}
function detailKey(id: string | undefined) {
  return [...CREDIT_NOTES_QUERY_KEY, "detail", id] as const;
}
function linesKey(id: string | undefined) {
  return [...CREDIT_NOTES_QUERY_KEY, "lines", id] as const;
}

export function useCreditNotesByInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: invoiceCreditNotesKey(invoiceId),
    queryFn: () => listCreditNotesByInvoice(invoiceId as string),
    enabled: !!invoiceId,
  });
}

export function useCreditNote(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getCreditNote(id as string),
    enabled: !!id,
  });
}

export function useCreditNoteLines(id: string | undefined) {
  return useQuery({
    queryKey: linesKey(id),
    queryFn: () => listCreditNoteLines(id as string),
    enabled: !!id,
  });
}

/** Invalidates the target invoice's own credit-note list on success — the new DRAFT note must appear in the invoice detail page's Credit Notes table without a manual refresh. */
export function useCreateCreditNote(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCreditNoteDto) => createCreditNote(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceCreditNotesKey(invoiceId) });
    },
  });
}

export function useSubmitCreditNote(invoiceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitCreditNote(id),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: detailKey(note.id) });
      queryClient.invalidateQueries({ queryKey: invoiceCreditNotesKey(invoiceId) });
    },
  });
}

export function useDecideCreditNote(invoiceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecideCreditNoteDto }) => decideCreditNote(id, dto),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: detailKey(note.id) });
      queryClient.invalidateQueries({ queryKey: invoiceCreditNotesKey(invoiceId) });
    },
  });
}

/**
 * `CreditNotesService.post()` — see class doc comment ("post() — P-06" /
 * "Invoice-side effect") — directly reduces the target invoice's own
 * `paidAmount`/`balance`/re-derives `status`, so on success this invalidates
 * BOTH the credit note's own query keys AND the target invoice's detail key
 * (`use-invoices.ts`'s exported `detailKey()`, reused here rather than
 * reconstructing the tuple shape) plus the invoice's student-invoices-list
 * and ledger keys — mirroring `usePostInvoice()`'s own exact invalidation
 * set, since a credit note post has the same real ledger/balance side
 * effects a direct invoice post does.
 */
export function usePostCreditNote(invoiceId: string, studentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postCreditNote(id),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: detailKey(note.id) });
      queryClient.invalidateQueries({ queryKey: invoiceCreditNotesKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: invoiceDetailKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: studentInvoicesKey(studentId) });
      queryClient.invalidateQueries({ queryKey: ["students", "ledger", studentId] });
    },
  });
}
