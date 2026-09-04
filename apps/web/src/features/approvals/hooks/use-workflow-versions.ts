"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublishWorkflowVersionDto, UpdateLevelDto, UpdateRoutingRuleDto } from "@klickit/contracts";
import {
  getWorkflowVersion,
  listLevels,
  listRoutingRules,
  listWorkflowVersions,
  publishWorkflowVersion,
  setCurrentWorkflowVersion,
  updateLevel,
  updateRoutingRule,
} from "../api/workflow-versions.api";

export const WORKFLOW_VERSIONS_QUERY_KEY = ["approvals", "workflow-versions"] as const;

function listByDefKey(defId: string | undefined) {
  return [...WORKFLOW_VERSIONS_QUERY_KEY, "by-def", defId] as const;
}
function detailKey(id: string | undefined) {
  return [...WORKFLOW_VERSIONS_QUERY_KEY, "detail", id] as const;
}
function levelsKey(versionId: string | undefined) {
  return [...WORKFLOW_VERSIONS_QUERY_KEY, "levels", versionId] as const;
}
function rulesKey(versionId: string | undefined) {
  return [...WORKFLOW_VERSIONS_QUERY_KEY, "routing-rules", versionId] as const;
}

export function useWorkflowVersions(defId: string | undefined) {
  return useQuery({ queryKey: listByDefKey(defId), queryFn: () => listWorkflowVersions(defId as string), enabled: !!defId });
}

export function useWorkflowVersion(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getWorkflowVersion(id as string), enabled: !!id });
}

export function useLevels(versionId: string | undefined) {
  return useQuery({ queryKey: levelsKey(versionId), queryFn: () => listLevels(versionId as string), enabled: !!versionId });
}

export function useRoutingRules(versionId: string | undefined) {
  return useQuery({ queryKey: rulesKey(versionId), queryFn: () => listRoutingRules(versionId as string), enabled: !!versionId });
}

/** Invalidates the def's own version list (a new current version exists now) — the caller navigates to the new version's detail page on success, which fetches its levels/rules fresh, so those keys don't need proactive invalidation here. */
export function usePublishWorkflowVersion(defId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: PublishWorkflowVersionDto) => publishWorkflowVersion(defId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listByDefKey(defId) });
    },
  });
}

export function useSetCurrentWorkflowVersion(defId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => setCurrentWorkflowVersion(versionId),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: listByDefKey(defId) });
      queryClient.invalidateQueries({ queryKey: detailKey(updated.id) });
    },
  });
}

export function useUpdateLevel(versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ levelId, dto }: { levelId: string; dto: UpdateLevelDto }) => updateLevel(levelId, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: levelsKey(versionId) }),
  });
}

export function useUpdateRoutingRule(versionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, dto }: { ruleId: string; dto: UpdateRoutingRuleDto }) => updateRoutingRule(ruleId, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey(versionId) }),
  });
}
