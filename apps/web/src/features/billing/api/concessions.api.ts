import type { ConcessionResponseDto, DecideConcessionDto, RequestConcessionDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

/**
 * Thin wrapper over `ConcessionsController`
 * (`packages/server/src/domains/billing/api/concessions.controller.ts`).
 * Permissions: `billing:concession:request`/`:view`/`:decide`.
 *
 * `GET /billing/concessions` takes exactly one of `invoiceId`/`studentId` as
 * a query param (`ConcessionsController.list()` reads both via plain
 * `@Query("invoiceId")`/`@Query("studentId")`, no `@ApiQuery` decorator —
 * passing neither returns an empty array; this codebase's own callers
 * always supply exactly one, mirroring `listCreditNotesByInvoice`
 * (`credit-notes.api.ts`)/`listInvoicesForStudent` (`invoices.api.ts`)'s own
 * two-function split rather than one function taking an ambiguous "either"
 * param). Unlike those two siblings' `query?: never` codegen gap, THIS
 * endpoint's generated type declares BOTH `invoiceId`/`studentId` as
 * required strings (`ConcessionsController_list`, confirmed by reading
 * `openapi-types.ts` directly) — the same "declared required, actually
 * optional" quirk `optionalQuery()` (`query-params.ts`) exists to paper
 * over, reused here rather than a raw object literal (which fails `tsc`
 * with a real "missing property" error, confirmed).
 */
export async function listConcessionsByInvoice(invoiceId: string): Promise<ConcessionResponseDto[]> {
  return unwrapApiResult<ConcessionResponseDto[]>(
    await apiClient.GET("/api/v1/billing/concessions", {
      params: { query: optionalQuery({ invoiceId, studentId: undefined }) },
    }),
  );
}

export async function listConcessionsByStudent(studentId: string): Promise<ConcessionResponseDto[]> {
  return unwrapApiResult<ConcessionResponseDto[]>(
    await apiClient.GET("/api/v1/billing/concessions", {
      params: { query: optionalQuery({ invoiceId: undefined, studentId }) },
    }),
  );
}

export async function getConcession(id: string): Promise<ConcessionResponseDto> {
  return unwrapApiResult<ConcessionResponseDto>(
    await apiClient.GET("/api/v1/billing/concessions/{id}", { params: { path: { id } } }),
  );
}

export async function requestConcession(dto: RequestConcessionDto): Promise<ConcessionResponseDto> {
  return unwrapApiResult<ConcessionResponseDto>(await apiClient.POST("/api/v1/billing/concessions", { body: dto }));
}

export async function decideConcession(id: string, dto: DecideConcessionDto): Promise<ConcessionResponseDto> {
  return unwrapApiResult<ConcessionResponseDto>(
    await apiClient.POST("/api/v1/billing/concessions/{id}/decide", { params: { path: { id } }, body: dto }),
  );
}

/** `ConcessionsService.postStandalone()` — see that class's own doc comment ("postStandalone — the frozen-invoice-columns design decision") — only valid on an APPROVED concession targeting an already-POSTED invoice. */
export async function postStandaloneConcession(id: string): Promise<ConcessionResponseDto> {
  return unwrapApiResult<ConcessionResponseDto>(
    await apiClient.POST("/api/v1/billing/concessions/{id}/post-standalone", { params: { path: { id } } }),
  );
}
