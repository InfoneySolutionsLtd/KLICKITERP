import "server-only";

/** Internal URL used only by Next.js server-side route handlers and SSR. */
export const SERVER_API_BASE_URL = process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3000/api/v1";
