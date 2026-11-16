import { MutationCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-error";
import { notifyMutationError, notifyMutationSuccess } from "./mutation-toast";

/**
 * Shared TanStack Query defaults. `retry` explicitly does NOT retry a 403
 * (permission-denied — retrying won't change the server's RBAC decision) or
 * a 401 (handled by `lib/api-client.ts`'s own single refresh-and-retry, not
 * TanStack Query retrying the same stale request) — every other error gets
 * up to 2 retries, the conventional default.
 *
 * The `MutationCache` is where the app-wide success / failure toasts come from: every `useMutation`
 * in the app flows through it, so each hook only declares its `meta` (see `lib/mutation-toast.ts`).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => notifyMutationSuccess(mutation.meta),
      onError: (error, _variables, _context, mutation) => notifyMutationError(error, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}
