import type { CreateWorkflowDefDto, UpdateWorkflowDefDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { WorkflowDef } from "../types";

/**
 * Thin wrapper over `WorkflowDefinitionsController`
 * (`packages/server/src/platform/approvals/api/workflow-definitions.controller.ts`).
 * `approvals:workflow:view` covers list/get, `approvals:workflow:manage`
 * covers create/update. There is no delete route — archiving a definition is
 * `updateWorkflowDefinition(id, {isActive: false})`.
 */
export async function listWorkflowDefinitions(): Promise<WorkflowDef[]> {
  return unwrapApiResult<WorkflowDef[]>(await apiClient.GET("/api/v1/approvals/workflow-definitions"));
}

export async function getWorkflowDefinition(id: string): Promise<WorkflowDef> {
  return unwrapApiResult<WorkflowDef>(
    await apiClient.GET("/api/v1/approvals/workflow-definitions/{id}", { params: { path: { id } } }),
  );
}

/**
 * `isActive` is `@ApiPropertyOptional({default: true})` server-side (genuinely
 * optional, confirmed by reading `create-workflow-def.dto.ts` directly) —
 * `@nestjs/swagger` drops the "optional" signal for this exact
 * `@ApiPropertyOptional({default})` shape, the same confirmed gap
 * `roles.api.ts`'s own `createRole()` doc comment documents for
 * `isAuditorClass`. `?? true` matches the DTO's own documented default,
 * not inventing new behavior.
 */
export async function createWorkflowDefinition(dto: CreateWorkflowDefDto): Promise<WorkflowDef> {
  return unwrapApiResult<WorkflowDef>(
    await apiClient.POST("/api/v1/approvals/workflow-definitions", { body: { ...dto, isActive: dto.isActive ?? true } }),
  );
}

export async function updateWorkflowDefinition(id: string, dto: UpdateWorkflowDefDto): Promise<WorkflowDef> {
  return unwrapApiResult<WorkflowDef>(
    await apiClient.PATCH("/api/v1/approvals/workflow-definitions/{id}", { params: { path: { id } }, body: dto }),
  );
}
