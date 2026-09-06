/**
 * Shape `JwtAuthGuard` (platform/auth) attaches to `req.user`. Declared
 * locally rather than imported from `platform/auth` — `platform/notifications`'
 * `mayImport` is `["shared", "platform/users"]` (module-deps.json), so this
 * is a structurally-typed duplicate of the guard's output shape, not a
 * cross-module import. Mirrors `platform/approvals`/`platform/comms`/
 * `platform/settings`/`platform/branding`'s own `api/request-context.ts`.
 */
export interface AuthenticatedRequest {
  user?: {
    sub: string;
    sid: string;
    roles: string[];
    permsHash: string;
  };
}
