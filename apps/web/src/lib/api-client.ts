"use client";

import { createApiClient, type Middleware } from "@klickit/contracts";
import { useAuthStore } from "./auth-store";
import { refreshSession } from "./session-api";

// The generated `paths` type embeds "/api/v1" in every key already (see
// .env.local's own doc comment for why) — this client's `baseUrl` is
// therefore the bare origin, NOT NEXT_PUBLIC_API_BASE_URL.
//
// Browser requests are deliberately same-origin. Nginx/Kong exposes the
// public API through /api/v1, so the internal API port must never appear in a
// browser URL (especially in an external deployment).
const API_ORIGIN = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

/**
 * Attaches `Authorization: Bearer <accessToken>` to every request from the
 * in-memory auth store (`createApiClient` deliberately doesn't bake this
 * in — see `packages/contracts/src/client.ts`'s own doc comment: "token
 * storage/refresh is a frontend concern"). On a 401, makes ONE attempt to
 * silently refresh via the httpOnly-cookie-backed `POST /api/auth/refresh`
 * route handler and, if that succeeds, retries the original request once
 * with the new token — openapi-fetch's `onResponse` hook can return a
 * different `Response` and it becomes the final result, so this is a real
 * transparent retry, not just a token swap for the NEXT request. If refresh
 * also fails, the auth store is cleared (`session-api.ts`'s own
 * `refreshSession()` does this) and the original 401 is returned as-is —
 * `<QueryBoundary>`/route guards handle bouncing the user back to /login.
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status !== 401) {
      return response;
    }
    const refreshed = await refreshSession();
    if (!refreshed) {
      return response;
    }
    const retryRequest = request.clone();
    retryRequest.headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
    return fetch(retryRequest);
  },
};

export const apiClient = createApiClient({ baseUrl: API_ORIGIN });
apiClient.use(authMiddleware);
