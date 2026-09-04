import type {
  LevelResponseDto,
  PublishWorkflowVersionDto,
  RoutingRuleResponseDto,
  UpdateLevelDto,
  UpdateRoutingRuleDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { WorkflowVersion } from "../types";

/**
 * Thin wrapper over `WorkflowVersionsController`
 * (`packages/server/src/platform/approvals/api/workflow-versions.controller.ts`)
 * — folds in versions + levels + routing rules, mirroring the real backend
 * controller's own shape (no separate controllers exist server-side either).
 * `approvals:workflow:view` covers every GET below, `approvals:workflow:manage`
 * covers publish/set-current/update-level/update-routing-rule. There is
 * deliberately no create/delete wrapper for an individual level or routing
 * rule — the real backend has no such route; `publishWorkflowVersion()` is
 * the only way to add or remove one (a whole new version, atomically).
 */
export async function listWorkflowVersions(defId: string): Promise<WorkflowVersion[]> {
  return unwrapApiResult<WorkflowVersion[]>(
    await apiClient.GET("/api/v1/approvals/workflow-definitions/{defId}/versions", { params: { path: { defId } } }),
  );
}

export async function getWorkflowVersion(id: string): Promise<WorkflowVersion> {
  return unwrapApiResult<WorkflowVersion>(
    await apiClient.GET("/api/v1/approvals/workflow-versions/{id}", { params: { path: { id } } }),
  );
}

/**
 * Local mirror interfaces for the 3 PATCH/POST bodies below — the same
 * `@ApiPropertyOptional({nullable: true})`-missing-`type` codegen gap
 * `UpdateDelegationRequestBody` (`delegations.api.ts`) documents, here
 * affecting `roleId`/`userIds` (level), `departmentId` (routing rule), plus
 * a second, distinct gap: `quorum`'s `@ApiPropertyOptional({default: 1})`
 * drops its own optionality the same way `isActive` did on
 * `CreateWorkflowDefDto` (`workflow-definitions.api.ts`'s own doc comment).
 * Each interface below documents/validates the REAL intended shape (assigning
 * `dto` to it at each call site confirms the two agree); the final
 * `as never` at each `apiClient` call is what actually gets past the broken
 * generated body type — see `UpdateDelegationRequestBody`'s own doc comment
 * for why `never` specifically. `PublishWorkflowVersionDto`/`UpdateLevelDto`/
 * `UpdateRoutingRuleDto` (these functions' own param types) stay the real,
 * correct generated types throughout.
 */
interface LevelInputRequestBody {
  seq: number;
  approverType: "ROLE" | "USERS" | "DEPT_HEAD";
  roleId?: string;
  userIds?: string[];
  mode: "SEQUENTIAL" | "PARALLEL";
  quorum?: number;
  slaHours?: number;
  escalation?: Record<string, unknown>;
}
interface RoutingRuleInputRequestBody {
  minAmount: string;
  maxAmount?: string;
  levelSubset?: number[];
  departmentId?: string;
}
interface PublishWorkflowVersionRequestBody {
  levels: LevelInputRequestBody[];
  routingRules: RoutingRuleInputRequestBody[];
}
interface UpdateLevelRequestBody {
  approverType?: "ROLE" | "USERS" | "DEPT_HEAD";
  roleId?: string | null;
  userIds?: string[] | null;
  mode?: "SEQUENTIAL" | "PARALLEL";
  quorum?: number;
  slaHours?: number | null;
  escalation?: Record<string, unknown> | null;
}
interface UpdateRoutingRuleRequestBody {
  minAmount?: string;
  maxAmount?: string | null;
  levelSubset?: number[] | null;
  departmentId?: string | null;
}

export async function publishWorkflowVersion(defId: string, dto: PublishWorkflowVersionDto): Promise<WorkflowVersion> {
  const body: PublishWorkflowVersionRequestBody = dto;
  return unwrapApiResult<WorkflowVersion>(
    await apiClient.POST("/api/v1/approvals/workflow-definitions/{defId}/versions/publish", {
      params: { path: { defId } },
      body: body as never,
    }),
  );
}

export async function setCurrentWorkflowVersion(id: string): Promise<WorkflowVersion> {
  return unwrapApiResult<WorkflowVersion>(
    await apiClient.POST("/api/v1/approvals/workflow-versions/{id}/set-current", { params: { path: { id } } }),
  );
}

export async function listLevels(versionId: string): Promise<LevelResponseDto[]> {
  return unwrapApiResult<LevelResponseDto[]>(
    await apiClient.GET("/api/v1/approvals/workflow-versions/{id}/levels", { params: { path: { id: versionId } } }),
  );
}

export async function updateLevel(levelId: string, dto: UpdateLevelDto): Promise<LevelResponseDto> {
  const body: UpdateLevelRequestBody = dto;
  return unwrapApiResult<LevelResponseDto>(
    await apiClient.PATCH("/api/v1/approvals/workflow-versions/levels/{levelId}", {
      params: { path: { levelId } },
      body: body as never,
    }),
  );
}

export async function listRoutingRules(versionId: string): Promise<RoutingRuleResponseDto[]> {
  return unwrapApiResult<RoutingRuleResponseDto[]>(
    await apiClient.GET("/api/v1/approvals/workflow-versions/{id}/routing-rules", { params: { path: { id: versionId } } }),
  );
}

export async function updateRoutingRule(ruleId: string, dto: UpdateRoutingRuleDto): Promise<RoutingRuleResponseDto> {
  const body: UpdateRoutingRuleRequestBody = dto;
  return unwrapApiResult<RoutingRuleResponseDto>(
    await apiClient.PATCH("/api/v1/approvals/workflow-versions/routing-rules/{ruleId}", {
      params: { path: { ruleId } },
      body: body as never,
    }),
  );
}
