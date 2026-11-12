import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // apps/web talks to apps/api exclusively via the typed @klickit/contracts
  // client from the browser (TanStack Query) — no Next.js rewrite/proxy is
  // used for business data, per ADR-004. The only server-side fetch in this
  // app is the theme route (app/api/theme/route.ts) and the three auth
  // token-plumbing route handlers (app/api/auth/*).

  // LOCAL DEV ONLY: `lib/api-client.ts` sends every browser API call
  // same-origin (`window.location.origin` + "/api/v1/..."), because in a real
  // deployment Nginx/Kong routes `/api/v1` to apps/api in front of this app.
  // `next dev` has no such ingress, so without this proxy every call lands on
  // Next's own 404 page ("Sign in failed" / "Not Found" on the login and
  // reset-password forms). This stands in for that routing layer. It works the
  // same whether the page is opened via localhost, a LAN IP, or a VS Code
  // devtunnel hostname, because the browser only ever talks to this server.
  // Disabled for production builds (NODE_ENV=production), where the real
  // ingress owns `/api/v1`. Target defaults to the same URL the server-side
  // route handlers use (`lib/server-api-url.ts`).
  async rewrites() {
    if (process.env.NODE_ENV === "production") {
      return [];
    }
    const target = process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3000/api/v1";
    return [{ source: "/api/v1/:path*", destination: `${target}/:path*` }];
  },
};

export default withNextIntl(nextConfig);
