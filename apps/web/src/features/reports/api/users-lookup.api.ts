import type { UserListResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * A small, self-contained `GET /users` wrapper for exactly one purpose: the
 * Audit Log report's `actorId` picker. Mirrors
 * `features/departments/api/users-lookup.api.ts` (and its siblings in
 * `comms`/`fixed-assets`/`payroll`) — deliberately duplicated rather than a
 * cross-feature import, matching this codebase's established "each feature
 * folder stays self-contained" convention for this one narrow lookup.
 */
const LOOKUP_PAGE_SIZE = 200;

interface UsersLookupQueryShape {
  page?: number;
  pageSize?: number;
  departmentId: string;
  status: string;
}

export async function listUsersForLookup(): Promise<UserListResponseDto> {
  return unwrapApiResult<UserListResponseDto>(
    await apiClient.GET("/api/v1/users", {
      params: { query: { pageSize: LOOKUP_PAGE_SIZE } as unknown as UsersLookupQueryShape },
    }),
  );
}
