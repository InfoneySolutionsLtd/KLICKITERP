import type { FcmConfig } from "../types";

/**
 * If `text` is a Firebase service-account JSON file (what the Firebase console
 * hands you to download) — complete or pretty-printed — returns the three
 * values the FCM form needs; otherwise `null`. Lets the form accept the whole
 * file pasted into the private-key box and fill every field from it, instead
 * of the credential check failing later on a "key" that is really a JSON
 * document. Not-JSON and JSON-without-a-private_key both return `null`, so
 * ordinary typing/pasting of a bare PEM is never intercepted.
 */
export function parseServiceAccountJson(text: string): Partial<FcmConfig> & { privateKey: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.private_key !== "string" || parsed.private_key.length === 0) return null;
    return {
      privateKey: parsed.private_key,
      ...(typeof parsed.project_id === "string" && parsed.project_id ? { projectId: parsed.project_id } : {}),
      ...(typeof parsed.client_email === "string" && parsed.client_email ? { clientEmail: parsed.client_email } : {}),
    };
  } catch {
    return null;
  }
}
