import type {
  CreateStudentOptionalItemDto,
  StudentOptionalItemResponseDto,
  UpdateStudentOptionalItemDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Part 3 (Billing sub-features batch) — thin wrapper over
 * `StudentOptionalItemsController`
 * (`packages/server/src/domains/billing/api/student-optional-items.controller.ts`)
 * — `POST/GET(?studentId=&termId=)/GET:id/PATCH/DELETE`, permissions
 * `billing:optional-item:manage`/`:view`. `PATCH` only accepts
 * `amountOverride` (`UpdateStudentOptionalItemDto`). Unique on
 * `(studentId, termId, feeCategoryId)` (confirmed by reading
 * `StudentOptionalItemsService.create()`) — a duplicate `create()` throws a
 * real `409 ConflictException`; left for the caller (the create dialog) to
 * catch and render a friendly message rather than the raw backend sentence.
 *
 * A row's mere existence is the enrollment signal `InvoicingService` reads
 * at `source: STRUCTURE` invoice-generation time — this must exist BEFORE
 * that term's invoice is generated for the student, no retroactive effect.
 */
export async function listStudentOptionalItems(studentId: string, termId: string): Promise<StudentOptionalItemResponseDto[]> {
  return unwrapApiResult<StudentOptionalItemResponseDto[]>(
    await apiClient.GET("/api/v1/billing/student-optional-items", { params: { query: { studentId, termId } } }),
  );
}

export async function getStudentOptionalItem(id: string): Promise<StudentOptionalItemResponseDto> {
  return unwrapApiResult<StudentOptionalItemResponseDto>(
    await apiClient.GET("/api/v1/billing/student-optional-items/{id}", { params: { path: { id } } }),
  );
}

export async function createStudentOptionalItem(dto: CreateStudentOptionalItemDto): Promise<StudentOptionalItemResponseDto> {
  return unwrapApiResult<StudentOptionalItemResponseDto>(
    await apiClient.POST("/api/v1/billing/student-optional-items", { body: dto }),
  );
}

export async function updateStudentOptionalItem(
  id: string,
  dto: UpdateStudentOptionalItemDto,
): Promise<StudentOptionalItemResponseDto> {
  return unwrapApiResult<StudentOptionalItemResponseDto>(
    await apiClient.PATCH("/api/v1/billing/student-optional-items/{id}", { params: { path: { id } }, body: dto }),
  );
}

/** Real `200`, no body — `StudentOptionalItemsService.remove()` 404s first if the id doesn't exist, same "load-then-delete" shape as most other real deletes in this codebase. */
export async function removeStudentOptionalItem(id: string): Promise<void> {
  const result = await apiClient.DELETE("/api/v1/billing/student-optional-items/{id}", { params: { path: { id } } });
  unwrapApiResult<void>(result);
}
