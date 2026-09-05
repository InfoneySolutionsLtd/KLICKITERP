"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
}

/**
 * Pure client-side UI preference (which "collapsed" is — never security- or
 * session-sensitive the way `auth-store.ts`'s in-memory-only token is), so
 * `persist` (zustand's own localStorage-backed middleware, bundled in the
 * already-installed `zustand` package — no new dependency) is the right
 * fit here, unlike `auth-store.ts`'s deliberate "never touches storage"
 * rule for the access token. `persist` hydrates from localStorage only
 * after mount, so the very first client render always sees the default
 * (`collapsed: false`) before snapping to the real remembered value a tick
 * later — the same "briefly wrong, corrected once mounted" tradeoff this
 * app already accepts for `ThemeToggle`/`DashboardGreeting`, not an
 * oversight.
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (value) => set({ collapsed: value }),
    }),
    { name: "klickit-sidebar" },
  ),
);
