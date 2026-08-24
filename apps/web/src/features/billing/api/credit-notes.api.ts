import type {
  CreateCreditNoteDto,
  CreditNoteLineResponseDto,
  CreditNoteResponseDto,
  DecideCreditNoteDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `CreditNotesController`
 * (`packages/server/src/domains/billing/api/credit-notes.controller.ts`).
 * Permissions: `billing:credit-note:manage`/`:view`.
 *
 * `listByInvoice` — same declared-vs-real `query?: never` codegen gap
 * `listInvoicesForStudent` (`invoices.api.ts`) already documents for this
 * generated OpenAPI client: `CreditNotesController_listByInvoice`'s real
 * handler reads `@Query("invoiceId")` directly, so passing it through still
 * works at runtime even though the generated type says the endpoint takes no
 * query params at all.
 */
export async function listCreditNotesByInvoice(invoiceId: string): Promise<CreditNoteResponseDto[]> {
  return unwrapApiResult<CreditNoteResponseDto[]>(
    await apiClient.GET("/api/v1/billing/credit-notes", { params: { query: { invoiceId } } }),
  );
}

export async function getCreditNote(id: string): Promise<CreditNoteResponseDto> {
  return unwrapApiResult<CreditNoteResponseDto>(
    await apiClient.GET("/api/v1/billing/credit-notes/{id}", { params: { path: { id } } }),
  );
}

export async function listCreditNoteLines(id: string): Promise<CreditNoteLineResponseDto[]> {
  return unwrapApiResult<CreditNoteLineResponseDto[]>(
    await apiClient.GET("/api/v1/billing/credit-notes/{id}/lines", { params: { path: { id } } }),
  );
}

export async function createCreditNote(dto: CreateCreditNoteDto): Promise<CreditNoteResponseDto> {
  return unwrapApiResult<CreditNoteResponseDto>(await apiClient.POST("/api/v1/billing/credit-notes", { body: dto }));
}

export async function submitCreditNote(id: string): Promise<CreditNoteResponseDto> {
  return unwrapApiResult<CreditNoteResponseDto>(
    await apiClient.POST("/api/v1/billing/credit-notes/{id}/submit", { params: { path: { id } } }),
  );
}

export async function decideCreditNote(id: string, dto: DecideCreditNoteDto): Promise<CreditNoteResponseDto> {
  return unwrapApiResult<CreditNoteResponseDto>(
    await apiClient.POST("/api/v1/billing/credit-notes/{id}/decide", { params: { path: { id } }, body: dto }),
  );
}

export async function postCreditNote(id: string): Promise<CreditNoteResponseDto> {
  return unwrapApiResult<CreditNoteResponseDto>(
    await apiClient.POST("/api/v1/billing/credit-notes/{id}/post", { params: { path: { id } } }),
  );
}
