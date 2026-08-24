import type {
  CreateFloatDto,
  FloatResponseDto,
  PettyCashVoucherResponseDto,
  ReplenishmentResponseDto,
  SpendDto,
  UpdateFloatCeilingDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — thin wrapper over
 * `PettyCashController` (`packages/server/src/domains/expenses/api/petty-cash.controller.ts`,
 * base `/api/v1/expenses/petty-cash`, realizing FR-EXP-003.1/BR-EXP-02/P-26)
 * — ALL 11 routes live on this one controller (confirmed by reading it
 * directly, 182 lines): `expenses:petty-cash:manage` gates float
 * create/list/get/ceiling-update + both float-scoped vouchers/replenishments
 * GETs, `expenses:petty-cash:spend` gates `spend()` alone,
 * `expenses:petty-cash:replenish-request` gates `requestReplenishment()`
 * alone, `expenses:petty-cash:replenish-decide` gates
 * approve/rejectReplenishment, `expenses:petty-cash:replenish-execute` gates
 * `executeReplenishment()` alone — 5 distinct permissions across one
 * controller, more granular than Part 1's own Categories/Vouchers split.
 *
 * **A genuinely different codegen finding from Part 1's own two files, TRUE
 * AS ORIGINALLY WRITTEN, no longer true for `SpendDto` after a later
 * regeneration (see `PettyCashSpendRequestBody`'s own doc comment below for
 * the cross-module `SpendDto` name collision that changed this)**:
 * `CreateFloatDto`/`UpdateFloatCeilingDto` still generate CLEANLY, with no
 * request-body gap — `petty-cash.dto.ts`'s own class fields for those two
 * carry no explicit `T | null` unions (unlike
 * `UpdateCategoryDto.parentId`/`UpdateVoucherDto.costCenterId` in Part 1) and
 * no `@ApiPropertyOptional({ default: ... })` decorators on booleans (unlike
 * `CreateCategoryDto.budgetRequired`/`.isActive`), so NestJS/Swagger's
 * reflection succeeds and the generated types match `@klickit/contracts`'
 * zod-inferred DTOs exactly for those two. `SpendDto` is the one exception,
 * for the unrelated cross-module collision reason documented below.
 *
 * Response-side, the same familiar gap DOES appear (needs no fix, same
 * reasoning Part 1's own files document): `PettyCashVoucherResponseDto.receiptFileId`/
 * `.journalId` and `ReplenishmentResponseDto.approvalRef`/`.journalId` all
 * degrade to `Record<string, never> | null` in the generated type (each is a
 * plain `nullable: true` `@ApiProperty` with no explicit `type: String`,
 * confirmed in `petty-cash.dto.ts`) — `unwrapApiResult<T>()`'s `data: unknown`
 * parameter absorbs this, and the REAL, correctly-typed response DTO (`string
 * | null` throughout, from `@klickit/contracts`' zod mirror) is what every
 * caller of this file actually gets back.
 *
 * **No query params anywhere on this controller** (confirmed directly against
 * the generated `paths["/api/v1/expenses/petty-cash/**"]` entries — every one
 * of the 11 routes takes only path params or a body) — so this file also
 * skips the standing conditional-query-object workaround every other
 * `*.api.ts` file in this codebase needs for at least one endpoint.
 *
 * **Status enums, confirmed directly against the entities, not assumed**:
 * `exp_petty_cash_voucher.status` is `DRAFT|PENDING_APPROVAL|APPROVED|CANCELLED`
 * per the DDL/entity's own CHECK constraint, but `PettyCashService.spend()`
 * (the ONLY code path that ever creates a row) hardcodes `status: "APPROVED"`
 * and `journalId: null` unconditionally — DRAFT/PENDING_APPROVAL/CANCELLED
 * are dead states no code path ever produces (confirmed by reading the whole
 * service, 334 lines: no other method ever touches a voucher's own
 * `status`/`journalId`). `exp_replenishment.status` is
 * `PENDING_APPROVAL|APPROVED|PAID` — genuinely all 3 are reachable
 * (`requestReplenishment()` creates PENDING_APPROVAL, `onApprovalDecided(true)`
 * moves to APPROVED, `execute()` moves to PAID) but a REJECTED decision
 * (`onApprovalDecided(false)`) hard-deletes the row instead of writing any
 * status at all — see `rejectReplenishment()` below.
 */
export type PettyCashVoucherStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "CANCELLED";
export type ReplenishmentStatus = "PENDING_APPROVAL" | "APPROVED" | "PAID";

export const REPLENISHMENT_STATUSES: readonly ReplenishmentStatus[] = ["PENDING_APPROVAL", "APPROVED", "PAID"];

/**
 * **New gap, found while regenerating contracts for the Transport Routes
 * enhancement (2026-08-24), unrelated to that feature**: `petty-cash.dto.ts`
 * and `domains/wallet/api/dto/wallet-transaction.dto.ts` both declare an
 * unqualified `export class SpendDto` — a genuine, pre-existing cross-module
 * DTO class-name collision `@nestjs/swagger` silently resolves by letting
 * whichever module's class happens to register last win the single shared
 * `components.schemas.SpendDto` slot (confirmed directly against the
 * regenerated `openapi.json`: `SpendDto` is now `{amount, servicePointId
 * (required), items?, idempotencyKey?}` — Wallet's own shape, not this
 * domain's `{categoryId, amount, receiptFileId?}`). Which domain wins is not
 * something either domain's own code controls, so it can silently flip
 * between regenerations — `features/wallet/api/wallets.api.ts`'s own doc
 * comment documents this exact collision from the OPPOSITE direction (found
 * when Expenses' shape was the winner) and the same prior decision applies
 * here: fixed on the frontend, NOT by renaming either server-side `SpendDto`
 * class (out of scope, a cross-module rename for a cosmetic collision).
 * `PettyCashSpendRequestBody` mirrors the CURRENTLY generated (wrong, for
 * this endpoint) shape purely so `apiClient.POST`'s inferred body type
 * accepts the cast; the real `dto: SpendDto` (this domain's own correct
 * `{categoryId, amount, receiptFileId?}` shape) is what's actually sent over
 * the wire.
 */
interface PettyCashSpendRequestBody {
  amount: string;
  servicePointId: string;
  items?: Record<string, never>;
  idempotencyKey?: string;
}

export async function createFloat(dto: CreateFloatDto): Promise<FloatResponseDto> {
  return unwrapApiResult<FloatResponseDto>(await apiClient.POST("/api/v1/expenses/petty-cash/floats", { body: dto }));
}

export async function listFloats(): Promise<FloatResponseDto[]> {
  return unwrapApiResult<FloatResponseDto[]>(await apiClient.GET("/api/v1/expenses/petty-cash/floats"));
}

export async function getFloat(id: string): Promise<FloatResponseDto> {
  return unwrapApiResult<FloatResponseDto>(await apiClient.GET("/api/v1/expenses/petty-cash/floats/{id}", { params: { path: { id } } }));
}

/** Server rejects with a real 422 if `ceiling` would fall below the float's current `balance` — `<UpdateCeilingDialog>` surfaces that message verbatim rather than pre-validating client-side. */
export async function updateFloatCeiling(id: string, dto: UpdateFloatCeilingDto): Promise<FloatResponseDto> {
  return unwrapApiResult<FloatResponseDto>(
    await apiClient.PATCH("/api/v1/expenses/petty-cash/floats/{id}/ceiling", { params: { path: { id } }, body: dto }),
  );
}

/**
 * Instant — always creates the voucher directly in `APPROVED` with
 * `journalId: null`, no approval workflow (see this file's own doc comment
 * above). Rejects with a real 422 (`BR-EXP-02`) if `amount` exceeds the
 * float's current `balance`.
 */
export async function spend(floatId: string, dto: SpendDto): Promise<PettyCashVoucherResponseDto> {
  return unwrapApiResult<PettyCashVoucherResponseDto>(
    await apiClient.POST("/api/v1/expenses/petty-cash/floats/{id}/spend", {
      params: { path: { id: floatId } },
      body: dto as unknown as PettyCashSpendRequestBody,
    }),
  );
}

export async function listFloatVouchers(floatId: string): Promise<PettyCashVoucherResponseDto[]> {
  return unwrapApiResult<PettyCashVoucherResponseDto[]>(
    await apiClient.GET("/api/v1/expenses/petty-cash/floats/{id}/vouchers", { params: { path: { id: floatId } } }),
  );
}

/**
 * No request body — server computes the covered voucher set entirely from
 * `floatId` + every prior replenishment's own `voucherIds` (the
 * "unclaimed since last replenishment" set-difference, see
 * `PettyCashService.requestReplenishment()`'s own doc comment). Rejects with
 * a real 422 when there are zero unclaimed APPROVED vouchers to replenish.
 */
export async function requestReplenishment(floatId: string): Promise<ReplenishmentResponseDto> {
  return unwrapApiResult<ReplenishmentResponseDto>(
    await apiClient.POST("/api/v1/expenses/petty-cash/floats/{id}/replenishments", { params: { path: { id: floatId } } }),
  );
}

export async function listReplenishments(floatId: string): Promise<ReplenishmentResponseDto[]> {
  return unwrapApiResult<ReplenishmentResponseDto[]>(
    await apiClient.GET("/api/v1/expenses/petty-cash/floats/{id}/replenishments", { params: { path: { id: floatId } } }),
  );
}

/** PENDING_APPROVAL -> APPROVED. Manual stand-in for a real approval-decision dispatcher, the same interim pattern every other approval-gated entity in this codebase already establishes (Requisitions, POs, Payment Vouchers, Budgets, Expense Vouchers). */
export async function approveReplenishment(id: string): Promise<ReplenishmentResponseDto> {
  return unwrapApiResult<ReplenishmentResponseDto>(
    await apiClient.POST("/api/v1/expenses/petty-cash/replenishments/{id}/approve", { params: { path: { id } } }),
  );
}

/**
 * PENDING_APPROVAL -> gone. **The row is HARD-DELETED, not status-flagged**
 * (`exp_replenishment`'s own 3-value enum has no REJECTED/CANCELLED —
 * confirmed by reading `PettyCashService.onApprovalDecided()` directly) — the
 * response still echoes back the deleted row's last-known shape (so a caller
 * can show a "rejected: <amount>" toast), but a subsequent `listReplenishments()`
 * call will NOT include it. `<ReplenishmentList>` must not expect a
 * REJECTED-badge row to persist in history — see that component's own doc
 * comment.
 */
export async function rejectReplenishment(id: string): Promise<ReplenishmentResponseDto> {
  return unwrapApiResult<ReplenishmentResponseDto>(
    await apiClient.POST("/api/v1/expenses/petty-cash/replenishments/{id}/reject", { params: { path: { id } } }),
  );
}

/** APPROVED -> PAID. The ONLY route that posts GL (P-26: debit `1015 Petty Cash Float` / credit the method-resolved Bank account) and restores the float's own `balance` toward `ceiling` (add-then-clamp, not a blind reset). */
export async function executeReplenishment(id: string): Promise<ReplenishmentResponseDto> {
  return unwrapApiResult<ReplenishmentResponseDto>(
    await apiClient.POST("/api/v1/expenses/petty-cash/replenishments/{id}/execute", { params: { path: { id } } }),
  );
}
