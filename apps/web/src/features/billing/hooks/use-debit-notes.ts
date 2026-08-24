"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateDebitNoteDto } from "@klickit/contracts";
import { createDebitNote, getDebitNote, listDebitNoteLines, listDebitNotesByStudent, postDebitNote } from "../api/debit-notes.api";
import { studentInvoicesKey } from "./use-invoices";

export const DEBIT_NOTES_QUERY_KEY = ["billing", "debit-notes"] as const;

function studentDebitNotesKey(studentId: string | undefined) {
  return [...DEBIT_NOTES_QUERY_KEY, "student", studentId] as const;
}
function detailKey(id: string | undefined) {
  return [...DEBIT_NOTES_QUERY_KEY, "detail", id] as const;
}
function linesKey(id: string | undefined) {
  return [...DEBIT_NOTES_QUERY_KEY, "lines", id] as const;
}

export function useDebitNotesByStudent(studentId: string | undefined) {
  return useQuery({
    queryKey: studentDebitNotesKey(studentId),
    queryFn: () => listDebitNotesByStudent(studentId as string),
    enabled: !!studentId,
  });
}

export function useDebitNote(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getDebitNote(id as string),
    enabled: !!id,
  });
}

export function useDebitNoteLines(id: string | undefined) {
  return useQuery({
    queryKey: linesKey(id),
    queryFn: () => listDebitNoteLines(id as string),
    enabled: !!id,
  });
}

export function useCreateDebitNote(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateDebitNoteDto) => createDebitNote(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentDebitNotesKey(studentId) });
    },
  });
}

/**
 * `DebitNotesService.post()` — see that service's own class doc comment
 * ("Design decision") — literally generates and posts a brand-new real
 * invoice under the hood (`InvoicingService.generateInvoice()` +
 * `.postInvoice()`), copying the resulting invoice's `id`/`journalId` back
 * onto the debit note row. On success this invalidates the debit note's own
 * keys AND the student's invoice list (`use-invoices.ts`'s exported
 * `studentInvoicesKey()`, reused here) plus the student's ledger — the same
 * real side effects any other invoice post has, since this IS one under the
 * hood.
 */
export function usePostDebitNote(studentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postDebitNote(id),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: detailKey(note.id) });
      queryClient.invalidateQueries({ queryKey: studentDebitNotesKey(studentId) });
      queryClient.invalidateQueries({ queryKey: studentInvoicesKey(studentId) });
      queryClient.invalidateQueries({ queryKey: ["students", "ledger", studentId] });
    },
  });
}
