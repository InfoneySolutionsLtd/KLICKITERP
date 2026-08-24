"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateStudentOptionalItemDto, UpdateStudentOptionalItemDto } from "@klickit/contracts";
import {
  createStudentOptionalItem,
  getStudentOptionalItem,
  listStudentOptionalItems,
  removeStudentOptionalItem,
  updateStudentOptionalItem,
} from "../api/student-optional-items.api";

/**
 * Part 3 (Billing sub-features batch) — TanStack Query wrapper over
 * `student-optional-items.api.ts`, same shape as `use-late-fee-policies.ts`/
 * `use-sponsor-awards.ts`. The list is keyed by BOTH `studentId` and
 * `termId` (the controller requires both — see the api file's own doc
 * comment), so switching the term in `OptionalItemsCard` naturally lands on
 * a fresh, independently-cached query rather than reusing another term's
 * list.
 */
export const STUDENT_OPTIONAL_ITEMS_QUERY_KEY = ["billing", "student-optional-items"] as const;

export function studentOptionalItemsListKey(studentId: string, termId: string) {
  return [...STUDENT_OPTIONAL_ITEMS_QUERY_KEY, "student", studentId, "term", termId] as const;
}

function detailKey(id: string) {
  return [...STUDENT_OPTIONAL_ITEMS_QUERY_KEY, "detail", id] as const;
}

export function useStudentOptionalItems(studentId: string, termId: string) {
  return useQuery({
    queryKey: studentOptionalItemsListKey(studentId, termId),
    queryFn: () => listStudentOptionalItems(studentId, termId),
    enabled: !!studentId && !!termId,
  });
}

export function useStudentOptionalItem(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getStudentOptionalItem(id),
    enabled: !!id,
  });
}

export function useCreateStudentOptionalItem(studentId: string, termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateStudentOptionalItemDto) => createStudentOptionalItem(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: studentOptionalItemsListKey(studentId, termId) }),
  });
}

/** `PATCH` only accepts `amountOverride` (see the api file's own doc comment). Not currently wired to any UI in this pass (the plan scopes this part to create + remove only), kept here for parity with the rest of this feature's hook files. */
export function useUpdateStudentOptionalItem(id: string, studentId: string, termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateStudentOptionalItemDto) => updateStudentOptionalItem(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentOptionalItemsListKey(studentId, termId) });
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
    },
  });
}

export function useRemoveStudentOptionalItem(studentId: string, termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeStudentOptionalItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: studentOptionalItemsListKey(studentId, termId) }),
  });
}
