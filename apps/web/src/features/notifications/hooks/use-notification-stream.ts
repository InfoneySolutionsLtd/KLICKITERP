"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import { refreshSession } from "@/lib/session-api";
import { createSseParser } from "../sse";
import { NOTIFICATIONS_KEY } from "./use-notifications";

const STREAM_PATH = "/api/v1/notifications/stream";
const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/** Waits 1 s, 2 s, 4 s ... up to 30 s after consecutive failures. */
export function retryDelay(failures: number): number {
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(failures - 1, 0));
}

/**
 * Keeps the bell live: opens the server's notification stream and, whenever the server says "something arrived", tells every
 * notification query to ask again. The stream carries no notification data, only that hint, so nothing is lost when it is
 * unavailable: the badge's 60-second poll and refetch-on-focus still bring everything in (see `useUnreadCount`).
 *
 * Uses `fetch` with the normal `Authorization: Bearer` header because `EventSource` cannot send one. The server closes each
 * stream after about 14 minutes (shorter than the access token's life) so a signed-out session cannot keep listening; this
 * hook then reconnects at once with the current token. It listens only while the tab is visible (a hidden tab polls instead),
 * refreshes once on a 401 like every other request, and backs off after failures.
 */
export function useNotificationStream(): void {
  const queryClient = useQueryClient();
  const authenticated = useAuthStore((state) => state.status === "authenticated");

  React.useEffect(() => {
    if (!authenticated) return;

    let stopped = false;
    let generation = 0;
    let controller: AbortController | null = null;
    let retryTimer: number | undefined;
    let failures = 0;

    const askAgain = () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

    async function connect(): Promise<void> {
      if (stopped || document.hidden) return;
      const mine = ++generation;
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      let outcome: "ended" | "failed" = "failed";

      try {
        const response = await fetch(`${window.location.origin}${STREAM_PATH}`, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}`, Accept: "text/event-stream" },
          cache: "no-store",
          signal,
        });
        if (response.status === 401) {
          // The access token expired: one silent refresh, then the next attempt uses the new token.
          if (!(await refreshSession())) return;
        } else if (response.ok && response.body) {
          failures = 0;
          const decoder = new TextDecoder();
          const parse = createSseParser((event) => {
            if (event.name === "ping") askAgain();
          });
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parse(decoder.decode(value, { stream: true }));
          }
          outcome = "ended"; // the server closed it on schedule: reconnect straight away
        }
      } catch {
        // A network error or our own abort: handled below.
      }

      if (stopped || mine !== generation || document.hidden) return;
      failures = outcome === "ended" ? 0 : failures + 1;
      retryTimer = window.setTimeout(() => void connect(), outcome === "ended" ? 0 : retryDelay(failures));
    }

    function onVisibilityChange() {
      if (document.hidden) {
        generation += 1; // whatever is in flight is now stale
        controller?.abort();
        window.clearTimeout(retryTimer);
      } else {
        askAgain(); // what arrived while the tab was hidden
        window.clearTimeout(retryTimer);
        void connect();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    void connect();

    return () => {
      stopped = true;
      generation += 1;
      controller?.abort();
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authenticated, queryClient]);
}
