"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fadeInUp, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Real prior-period delta only — never fabricated. Audited all 10 real
 * `dashboard.controller.ts` endpoints during Slice 1.5 (docs/phase-6/PROGRESS.md):
 * none currently return a genuine prior-period comparison value, so no call
 * site in `dashboard/page.tsx` passes this prop today. It exists so a
 * future real endpoint can plug in without another KpiCard rework.
 */
export interface KpiTrend {
  value: number;
  label?: string;
}

type KpiTone = "default" | "success" | "warning" | "destructive";

/**
 * Dashboard card-styling pass — each tone's icon badge went from a flat
 * `bg-tint-X` circle to a two-stop gradient (`--color-X` down to the same
 * card's own `--tint-X`) plus a soft `color-mix()`-derived glow shadow
 * tinted to match. `color-mix()` again (not a Tailwind `/NN` opacity
 * modifier) for the same documented reason every other tinted effect in
 * this app uses it: this app's colors are raw `var(--x)` CSS custom
 * properties, and Tailwind's alpha-modifier syntax silently no-ops on
 * those (docs/phase-6/PROGRESS.md Slice 1.5b bug #3).
 */
const TONE_ICON_GRADIENT: Record<KpiTone, string> = {
  default: "bg-[linear-gradient(135deg,var(--color-primary),var(--tint-primary))]",
  success: "bg-[linear-gradient(135deg,var(--success),var(--tint-success))]",
  warning: "bg-[linear-gradient(135deg,var(--warning),var(--tint-warning))]",
  destructive: "bg-[linear-gradient(135deg,var(--destructive),var(--tint-destructive))]",
};

const TONE_ICON_SHADOW: Record<KpiTone, string> = {
  default: "shadow-[0_6px_16px_-4px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]",
  success: "shadow-[0_6px_16px_-4px_color-mix(in_srgb,var(--success)_45%,transparent)]",
  warning: "shadow-[0_6px_16px_-4px_color-mix(in_srgb,var(--warning)_45%,transparent)]",
  destructive: "shadow-[0_6px_16px_-4px_color-mix(in_srgb,var(--destructive)_45%,transparent)]",
};

/** A barely-there corner wash in the card's own tone — pure depth, not a color statement (kept to a single-digit `color-mix()` percentage so it reads as texture, not a colored card). */
const TONE_WASH: Record<KpiTone, string> = {
  default: "bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--color-primary)_7%,transparent),transparent_70%)]",
  success: "bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--success)_7%,transparent),transparent_70%)]",
  warning: "bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--warning)_7%,transparent),transparent_70%)]",
  destructive: "bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--destructive)_7%,transparent),transparent_70%)]",
};

export function KpiCard({
  title,
  value,
  subtitle,
  tone = "default",
  icon: Icon,
  trend,
  index = 0,
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: KpiTone;
  /** Slice 1.5 (visual redesign) — a colored icon badge replacing the bare-number KPI card, per the reference screenshots. Optional so any call site not yet given a semantically-sensible icon still renders correctly. */
  icon?: React.ComponentType<{ className?: string }>;
  trend?: KpiTrend;
  /**
   * Slice 1.5b (visual polish iteration) — 0-based position in its grid,
   * used only to compute a small stagger delay (`lib/motion.ts`'s
   * `staggerDelay`) for this card's own fade+rise mount animation. Each
   * `<KpiCard>` sits behind its own `<QueryBoundary>` and mounts
   * independently once ITS query resolves (docs/phase-6/PROGRESS.md scope
   * item 8 — one failing widget never blanks the page), so this is a
   * best-effort visual stagger (real queries typically resolve within
   * milliseconds of each other, not a synchronized parent-controlled
   * stagger) rather than a guaranteed lock-step sequence.
   */
  index?: number;
}) {
  return (
    <motion.div className="h-full" variants={fadeInUp} custom={staggerDelay(index)} initial="hidden" animate="show">
      <Card className="group relative flex h-full flex-col overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
        {/* Corner wash — see `TONE_WASH`'s own doc comment. `aria-hidden` +
            `pointer-events-none`: pure decoration, never intercepts clicks
            or gets announced to a screen reader. */}
        <span aria-hidden className={cn("pointer-events-none absolute inset-0", TONE_WASH[tone])} />
        <CardHeader className="relative flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle>{title}</CardTitle>
          {Icon && (
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl text-brand-surface transition-transform duration-200 group-hover:scale-105",
                TONE_ICON_GRADIENT[tone],
                TONE_ICON_SHADOW[tone],
              )}
            >
              <Icon className="size-[18px]" />
            </span>
          )}
        </CardHeader>
        <CardContent className="relative flex flex-1 flex-col justify-center">
          <div
            className={cn(
              "text-2xl font-semibold tracking-tight",
              tone === "success" && "text-success",
              tone === "warning" && "text-warning",
              tone === "destructive" && "text-destructive",
            )}
          >
            {value}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && (
              <span className={cn("text-xs font-medium", trend.value >= 0 ? "text-success" : "text-destructive")}>
                {trend.value >= 0 ? "+" : ""}
                {trend.value}
                {trend.label ? ` ${trend.label}` : ""}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
