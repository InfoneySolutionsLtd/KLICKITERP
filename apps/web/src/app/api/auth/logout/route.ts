import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE_NAME } from "@/lib/auth-cookie";
import { SERVER_API_BASE_URL } from "@/lib/server-api-url";

/**
 * Clears the httpOnly refresh cookie and best-effort calls the real backend
 * `POST /auth/logout` (revokes the session server-side — requires the
 * caller's still-live access token as a Bearer header, since that's how
 * `JwtAuthGuard` resolves `sid` to revoke). The cookie is always cleared
 * regardless of whether the backend call succeeds — a client that thinks
 * it's logged out must never still be able to silently refresh.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { accessToken?: string };

  if (body.accessToken) {
    try {
      await fetch(`${SERVER_API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${body.accessToken}` },
        cache: "no-store",
      });
    } catch {
      // Best-effort — the cookie clears below regardless (see doc comment).
    }
  }

  const response = NextResponse.json({ loggedOut: true });
  response.cookies.delete({ name: REFRESH_COOKIE_NAME, path: "/api/auth" });
  return response;
}
