import type { UserListResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { UserSummary } from "../types";

/**
 * `GET /users/{id}` (`users:user:view`-gated) — no bulk lookup endpoint
 * exists anywhere in this codebase (confirmed by reading `users.controller.ts`
 * directly), so initiator/actor name resolution is genuinely one call per
 * distinct user id; `useUser()`'s TanStack Query cache dedupes repeated
 * lookups of the same id across an inbox table/action trail for free. See
 * `../types.ts`'s own doc comment for why the response type is hand-typed
 * (no `@ApiResponse({type})` on this handler) and deliberately partial (not
 * the raw entity, which carries `passwordHash`/2FA secret columns).
 */
export async function getUser(id: string): Promise<UserSummary> {
  return unwrapApiResult<UserSummary>(await apiClient.GET("/api/v1/users/{id}", { params: { path: { id } } }));
}

/**
 * A small, self-contained `GET /users` wrapper for exactly one purpose: the
 * USERS-mode level approver picker and the delegation from/to pickers below
 * (Feature: workflow admin UI). Deliberately NOT importing
 * `features/departments/api/users-lookup.api.ts`'s own identical-in-spirit
 * wrapper — matches this codebase's established "each feature folder stays
 * self-contained" convention (that file's own doc comment states this
 * explicitly, and lists this exact file, `features/approvals/api/users.api.ts`,
 * as one of the wrappers it deliberately does not import from).
 *
 * `UsersController.list()` has no `q` search param — fetches one larger page
 * (`pageSize=200`) and lets `<Combobox>`/`<MultiSelect>`'s own client-side
 * substring filter handle it, same tradeoff as the Departments precedent.
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
