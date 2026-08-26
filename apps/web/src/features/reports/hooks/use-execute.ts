"use client";

import { useMutation } from "@tanstack/react-query";
import { executeReport } from "../api/execute.api";

/**
 * No cache invalidation — a report execution never changes server state, and
 * results aren't cached across runs (a fresh run with the same params is
 * always a fresh, real fetch). A 403 (caller lacks that report's own
 * `reports:<code>:view` permission, checked dynamically server-side) is left
 * to the caller to catch via `ApiError`, the same inline try/catch pattern
 * every other mutation-level 403 in this codebase already uses.
 */
export function useExecuteReport() {
  return useMutation({
    mutationFn: ({ code, params }: { code: string; params: Record<string, unknown> }) => executeReport(code, params),
  });
}
