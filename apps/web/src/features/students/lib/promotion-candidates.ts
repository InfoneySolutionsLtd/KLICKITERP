import type { ClassResponseDto, PromotionInputDto } from "@klickit/contracts";

/**
 * Client-side candidate-row state for the "New Promotion Batch" flow. The
 * real backend has no candidate-generation of its own (see
 * `promotion-batches.api.ts`'s own doc comment) — this pipeline exists
 * entirely in the frontend: pick a source class, fetch its active students,
 * default each one's target class/stream, let the operator review/override
 * or exclude, then flatten into the real `PromotionInputDto[]` the single
 * commit POST needs.
 */
export interface PromotionCandidateRow {
  studentId: string;
  admissionNo: string;
  studentLabel: string;
  currentClassId: string;
  currentStreamId: string | null;
  toClassId: string;
  toStreamId: string;
  excluded: boolean;
}

/**
 * `StdClassEntity.level` is the only ordering concept this backend exposes
 * (metadata only — `PromotionService` itself never reads it, confirmed by
 * reading it directly) — this is the frontend's own convention for a
 * sensible default, not something the server enforces or even knows about.
 * Returns the class at exactly `level + 1`; `undefined` if none exists
 * (the student is in the top-most class — a real "graduating" case the
 * caller should surface, not silently default to something wrong).
 */
export function computeDefaultTargetClass(currentClassId: string, classes: ClassResponseDto[]): ClassResponseDto | undefined {
  const current = classes.find((c) => c.id === currentClassId);
  if (!current) return undefined;
  return classes.find((c) => c.level === current.level + 1);
}

export function updateCandidateRow(rows: PromotionCandidateRow[], studentId: string, patch: Partial<PromotionCandidateRow>): PromotionCandidateRow[] {
  return rows.map((row) => (row.studentId === studentId ? { ...row, ...patch } : row));
}

/** Drops excluded rows and any row with no target class picked (a real, required field — a "graduating" student the operator never assigned a target to is implicitly excluded, not sent with an empty `toClassId`). */
export function buildPromotionInputs(rows: PromotionCandidateRow[]): PromotionInputDto[] {
  return rows
    .filter((row) => !row.excluded && row.toClassId)
    .map((row) => ({
      studentId: row.studentId,
      toClassId: row.toClassId,
      ...(row.toStreamId ? { toStreamId: row.toStreamId } : {}),
    }));
}
