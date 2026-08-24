import type { CreateDebitNoteDto, DebitNoteLineResponseDto, DebitNoteResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `DebitNotesController`
 * (`packages/server/src/domains/billing/api/debit-notes.controller.ts`).
 * Permissions: `billing:debit-note:manage`/`:view`. No submit/decide routes
 * exist at all on this controller (confirmed by reading it) — no approval
 * workflow was ever seeded for this document type, `post()` is callable
 * directly from DRAFT.
 *
 * `listByStudent` — same declared-vs-real `query?: never` codegen gap
 * `listInvoicesForStudent` (`invoices.api.ts`) already documents: the real
 * handler reads `@Query("studentId")` directly.
 */
export async function listDebitNotesByStudent(studentId: string): Promise<DebitNoteResponseDto[]> {
  return unwrapApiResult<DebitNoteResponseDto[]>(
    await apiClient.GET("/api/v1/billing/debit-notes", { params: { query: { studentId } } }),
  );
}

export async function getDebitNote(id: string): Promise<DebitNoteResponseDto> {
  return unwrapApiResult<DebitNoteResponseDto>(
    await apiClient.GET("/api/v1/billing/debit-notes/{id}", { params: { path: { id } } }),
  );
}

export async function listDebitNoteLines(id: string): Promise<DebitNoteLineResponseDto[]> {
  return unwrapApiResult<DebitNoteLineResponseDto[]>(
    await apiClient.GET("/api/v1/billing/debit-notes/{id}/lines", { params: { path: { id } } }),
  );
}

export async function createDebitNote(dto: CreateDebitNoteDto): Promise<DebitNoteResponseDto> {
  return unwrapApiResult<DebitNoteResponseDto>(await apiClient.POST("/api/v1/billing/debit-notes", { body: dto }));
}

export async function postDebitNote(id: string): Promise<DebitNoteResponseDto> {
  return unwrapApiResult<DebitNoteResponseDto>(
    await apiClient.POST("/api/v1/billing/debit-notes/{id}/post", { params: { path: { id } } }),
  );
}
