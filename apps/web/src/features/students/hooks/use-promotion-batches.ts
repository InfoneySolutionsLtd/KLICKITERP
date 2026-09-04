"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PromoteBatchDto } from "@klickit/contracts";
import { getPromotionBatch, listPromotionBatches, promoteBatch } from "../api/promotion-batches.api";
import { STUDENTS_QUERY_KEY } from "./use-students";

export const PROMOTION_BATCHES_QUERY_KEY = ["students", "promotion-batches"] as const;

function detailKey(id: string | undefined) {
  return [...PROMOTION_BATCHES_QUERY_KEY, "detail", id] as const;
}

/** `students:promotion:execute`-gated server-side (the one, only permission on this controller); a 403 surfaces to `<QueryBoundary>` untouched. */
export function usePromotionBatches() {
  return useQuery({ queryKey: PROMOTION_BATCHES_QUERY_KEY, queryFn: listPromotionBatches });
}

export function usePromotionBatch(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getPromotionBatch(id as string), enabled: !!id });
}

/**
 * `promoteBatch()` mutates `std_student.class_id`/`.stream_id` directly for
 * every successfully-promoted student — invalidates the whole
 * `STUDENTS_QUERY_KEY` list prefix rather than threading through the exact
 * set of successfully-promoted ids (the response's own `summary` carries a
 * count, not a list — see `promotion-batches.api.ts`'s own doc comment), the
 * same "small, infrequent operation, blunt invalidation is fine" tradeoff
 * `useDeleteClass()` accepts for its own list refresh. Also invalidates the
 * batches list so the new batch appears immediately.
 */
export function usePromoteBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: PromoteBatchDto) => promoteBatch(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMOTION_BATCHES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "list"] });
    },
  });
}
