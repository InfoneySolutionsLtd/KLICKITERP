"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Dashboard card-styling pass — the shared shape every non-KPI dashboard
 * widget (Collection Rate, Collection Trend, Income vs Expense, Top
 * Defaulters, Cash Flow) now renders through, replacing 5 near-identical
 * hand-written `<Card><CardHeader><CardTitle>...` blocks in `dashboard/
 * page.tsx`. Mirrors `<KpiCard>`'s own visual language from the same pass
 * (hover-lift, a barely-there corner wash, a gradient+glow icon badge) so
 * the whole page reads as one consistent system rather than KPI tiles and
 * everything-else looking like two different design eras.
 */
export function DashboardCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--color-primary)_6%,transparent),transparent_70%)]"
      />
      <CardHeader className="relative flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base text-foreground">{title}</CardTitle>
        {Icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg text-brand-surface transition-transform duration-200 group-hover:scale-105",
              "bg-[linear-gradient(135deg,var(--color-primary),var(--tint-primary))]",
              "shadow-[0_4px_12px_-4px_color-mix(in_srgb,var(--color-primary)_40%,transparent)]",
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </CardHeader>
      <CardContent className="relative flex flex-1 flex-col">{children}</CardContent>
    </Card>
  );
}
