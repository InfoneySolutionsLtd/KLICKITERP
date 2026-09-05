"use client";

import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSidebarStore } from "@/lib/sidebar-store";
import { cn } from "@/lib/utils";

export const SIDEBAR_EXPANDED_WIDTH = "w-60";
export const SIDEBAR_COLLAPSED_WIDTH = "w-20";

/**
 * The collapsible client shell around `<Sidebar>`'s static server-rendered
 * chrome (logo/product name/decorative motifs) and `<NavLinks>` — split out
 * from `sidebar.tsx` specifically because collapse state is genuinely
 * interactive (a click handler + a persisted preference, `lib/sidebar-
 * store.ts`), which a server component structurally cannot own. `<NavLinks>`
 * reads the SAME store directly (no prop-drilling `collapsed` through this
 * component) — it's already a client component ("use client" island nested
 * inside this server-rendered `<aside>", the same pattern this file's own
 * predecessor already established for nav-link gating).
 *
 * Width animates via a plain CSS `transition-[width]` (no framer-motion
 * layout animation) — this is a discrete two-state toggle, not a
 * physics-driven interaction, and a CSS transition is the simpler, cheaper
 * tool for it; framer-motion here would just be an unnecessary dependency
 * on the same result.
 *
 * **Real bug found live**: the toggle button was first built as a direct
 * child of the outer `<aside>`, positioned to straddle its right edge
 * (`-right-3`, half in/half out — a common "floating panel" toggle look).
 * But that same `<aside>` carries `overflow-hidden` (required so the
 * decorative diamond motifs, which are deliberately sized to bleed past
 * the panel's own edge, get clipped to its rounded corners) — which ALSO
 * clipped the half of the button sitting outside the panel's own box,
 * leaving only a barely-visible sliver. Fixed by moving `overflow-hidden`
 * (and the background/rounding/shadow that make this read as a card) onto
 * an INNER `absolute inset-0` wrapper that holds the motifs/header/nav,
 * while the outer `<aside>` becomes a plain non-clipping positioning
 * container — the button is now a sibling of that inner wrapper, so it can
 * overflow the panel's edge without being cut off by the same clip that
 * correctly still applies to the motifs. Also restyled from a
 * low-contrast `bg-card` (blended into the light-mode page background) to
 * a solid brand-primary fill, so it reads as a clear, clickable control in
 * both light and dark mode, not a near-invisible outline.
 */
export function SidebarShell({
  logoUrl,
  productName,
  children,
}: {
  logoUrl: string | null;
  productName: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("shell");
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);

  return (
    <aside
      className={cn(
        "relative m-4 hidden shrink-0 md:block print:hidden",
        "transition-[width] duration-300 ease-in-out",
        collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
      )}
    >
      <div className="absolute inset-0 flex flex-col overflow-hidden rounded-xl bg-brand-dark shadow-card">
        {/* Geometric motif, sourced from the brand PDF's own "Layout & UI
            Principles" (p.10): "Geometric Motifs: Diamonds from logo" (the
            Infoney logo mark is itself diamond-shaped). Unchanged from the
            pre-collapse version of this file — purely decorative, stays put
            regardless of collapse state. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rotate-45 rounded-2xl border border-brand-surface opacity-[0.06]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rotate-45 rounded-2xl border border-brand-surface opacity-[0.04]"
        />

        <div
          className={cn(
            "relative z-10 flex h-16 shrink-0 items-center gap-2.5 border-b border-brand-surface/10 px-4",
            collapsed && "justify-center px-0",
          )}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed, expiring MinIO URL isn't a static asset next/image can profitably optimize/cache.
            <img src={logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-[2px] object-contain" />
          ) : (
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] bg-brand-accent" />
          )}
          {!collapsed && (
            <span className="truncate text-base font-semibold text-brand-surface" style={{ fontFamily: "var(--font-family)" }}>
              {productName}
            </span>
          )}
        </div>
        <div className="sidebar-scroll relative z-10 flex-1 overflow-y-auto py-4">{children}</div>
      </div>

      {/* Collapse/expand toggle — a solid circular button straddling the
          panel's own right edge (see this file's own doc comment for why
          it must live OUTSIDE the inner `overflow-hidden` wrapper above,
          and why it's a solid fill rather than the original low-contrast
          outline style). */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
        className="absolute -right-3.5 top-[4.5rem] z-20 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_8px_-1px_color-mix(in_srgb,var(--color-primary)_55%,transparent)] transition-transform duration-200 hover:scale-110"
      >
        <ChevronLeft className={cn("size-4 transition-transform duration-300 ease-in-out", collapsed && "rotate-180")} />
      </button>
    </aside>
  );
}
