import type { PromoteBatchDto, PromotionBatchResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `PromotionController`
 * (`packages/server/src/domains/students/api/promotion.controller.ts`) —
 * `POST /students/promotion-batches` (the commit itself, synchronous and
 * irreversible), `GET /students/promotion-batches` (list, newest not
 * guaranteed first — confirmed no ordering exists server-side, sorted
 * client-side by `executedAt` where it matters), `GET .../{id}`. All 3 gated
 * by the single permission `students:promotion:execute` — there is no
 * separate `:view` permission on this controller.
 *
 * **There is no candidate-generation or preview endpoint anywhere in this
 * backend** — `dto.promotions[]` must already be the caller's fully-resolved
 * decision (`{studentId, toClassId, toStreamId?}`) per student before this
 * POST fires; the request IS the commit. See `../lib/promotion-candidates.ts`
 * for the client-side pipeline that builds this array.
 */
export async function listPromotionBatches(): Promise<PromotionBatchResponseDto[]> {
  return unwrapApiResult<PromotionBatchResponseDto[]>(await apiClient.GET("/api/v1/students/promotion-batches"));
}

export async function getPromotionBatch(id: string): Promise<PromotionBatchResponseDto> {
  return unwrapApiResult<PromotionBatchResponseDto>(
    await apiClient.GET("/api/v1/students/promotion-batches/{id}", { params: { path: { id } } }),
  );
}

export async function promoteBatch(dto: PromoteBatchDto): Promise<PromotionBatchResponseDto> {
  return unwrapApiResult<PromotionBatchResponseDto>(
    await apiClient.POST("/api/v1/students/promotion-batches", { body: dto }),
  );
}

/**
 * `PromotionBatchResponseDto.summary` is typed `Record<string, unknown>` on
 * the wire (bare jsonb passthrough, no server-side `@ApiResponse` schema for
 * its inner shape) — this mirrors the REAL shape, confirmed by reading
 * `PromotionService`'s own exported `PromotionBatchSummary` interface
 * directly (`packages/server/src/domains/students/application/promotion.service.ts`):
 * `{totalRequested: number, promotedCount: number, failedCount: number,
 * failures: {studentId, reason}[]}` — same "typed local parse of an untyped
 * jsonb column" pattern `features/billing/api/late-fee-batches.api.ts`'s own
 * `parseLateFeeBatchSummary()` establishes. Note there is no list of
 * SUCCESSFULLY promoted student ids anywhere in this shape, only a count —
 * the caller already knows who it submitted, so the successful set is
 * `submitted minus failures`, not something this parser can reconstruct on
 * its own.
 */
export interface PromotionFailure {
  studentId: string;
  reason: string;
}

export interface PromotionBatchSummary {
  totalRequested: number;
  promotedCount: number;
  failedCount: number;
  failures: PromotionFailure[];
}

const EMPTY_SUMMARY: PromotionBatchSummary = { totalRequested: 0, promotedCount: 0, failedCount: 0, failures: [] };

/** Defensively parses the untyped jsonb into the real shape above — every field `typeof`-checked, never trusted blindly; a malformed entry is silently dropped rather than throwing, since this backs display-only UI (same discipline `parseLateFeeBatchSummary()` applies). */
export function parsePromotionBatchSummary(raw: Record<string, unknown> | null | undefined): PromotionBatchSummary {
  if (!raw) return EMPTY_SUMMARY;
  const totalRequested = typeof raw.totalRequested === "number" ? raw.totalRequested : 0;
  const promotedCount = typeof raw.promotedCount === "number" ? raw.promotedCount : 0;
  const failedCount = typeof raw.failedCount === "number" ? raw.failedCount : 0;
  const rawFailures = Array.isArray(raw.failures) ? raw.failures : [];
  const failures = rawFailures
    .map((f) => parseFailure(f as Record<string, unknown>))
    .filter((f): f is PromotionFailure => f !== null);
  return { totalRequested, promotedCount, failedCount, failures };
}

function parseFailure(entry: Record<string, unknown>): PromotionFailure | null {
  if (typeof entry.studentId !== "string" || typeof entry.reason !== "string") return null;
  return { studentId: entry.studentId, reason: entry.reason };
}
