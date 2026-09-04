"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateWorkflowDefDto, UpdateWorkflowDefDto } from "@klickit/contracts";
import {
  createWorkflowDefinition,
  getWorkflowDefinition,
  listWorkflowDefinitions,
  updateWorkflowDefinition,
} from "../api/workflow-definitions.api";

/** `["approvals","workflow-definitions"]` — a sibling query-key prefix to the existing `["approvals","instances"]`, not nested under it (this is a distinct resource). Mirrors `features/roles/hooks/use-roles.ts`'s exact shape. */
export const WORKFLOW_DEFS_QUERY_KEY = ["approvals", "workflow-definitions"] as const;

function detailKey(id: string | undefined) {
  return [...WORKFLOW_DEFS_QUERY_KEY, "detail", id] as const;
}

/** `approvals:workflow:view`-gated server-side; a 403 surfaces to `<QueryBoundary>` untouched. */
export function useWorkflowDefinitions() {
  return useQuery({ queryKey: WORKFLOW_DEFS_QUERY_KEY, queryFn: listWorkflowDefinitions });
}

export function useWorkflowDefinition(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getWorkflowDefinition(id as string), enabled: !!id });
}

export function useCreateWorkflowDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateWorkflowDefDto) => createWorkflowDefinition(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKFLOW_DEFS_QUERY_KEY }),
  });
}

/** Diff-based submit at each call site, mirrors `useUpdateRole` — invalidates both the list and this definition's own detail cache. */
export function useUpdateWorkflowDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateWorkflowDefDto }) => updateWorkflowDefinition(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: WORKFLOW_DEFS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}
