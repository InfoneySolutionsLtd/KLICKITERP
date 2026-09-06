"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Glassmorphism shell shared by every `(auth)` screen (login, 2FA,
 * change-password, forgot-password, reset-password) — one definition
 * instead of five copies of the same arbitrary-value class strings
 * drifting apart.
 *
 * Slice (light-glass pass): pivoted from an earlier dark-glass/white-text
 * version to a LIGHT frosted glass card (`bg-white/70` + `backdrop-blur-xl`)
 * — the user supplied a reference design showing the aurora background
 * bleeding softly through a light, semi-transparent card rather than a dark
 * one. This is a real simplification, not just a color swap: `Card`'s own
 * default `text-card-foreground` (dark) is correct again once the card
 * itself is light, so `Label`/`CardDescription`/`PasswordInput`'s toggle
 * icon all use their normal light-background defaults — no per-field
 * white-text override classes needed anywhere anymore (the earlier
 * `authLabelClass`/`authPasswordToggleClass` exports were removed for
 * exactly this reason, not kept around as now-inert dead code).
 *
 * The icon badge reuses the gradient+glow language `KpiCard`/
 * `RowActionButton` already established this session (`--color-primary` ->
 * `--color-accent`, a `color-mix()`-derived glow shadow) — the app's own
 * visual signature for an icon badge, not a generic stock icon.
 *
 * Footer: a copyright line with two real external links (Klickit Education /
 * Infoney Solutions Limited, both `target="_blank" rel="noopener noreferrer"`
 * — external sites, no `window.opener` access needed or wanted) — split into
 * separate i18n keys per sentence fragment (`copyrightPrefix`/`copyrightKlickit`/
 * `copyrightProductPrefix`/`copyrightInfoney`) rather than one interpolated
 * string, since a link needs to wrap only PART of the translated sentence;
 * `next-intl`'s plain `t()` returns a string, not markup, and no other
 * screen in this app has needed rich-text formatting yet. The year comes
 * from `new Date().getFullYear()` at render time — never hardcoded, so it
 * never needs a manual yearly update.
 */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const t = useTranslations("auth");
  const currentYear = new Date().getFullYear();
  return (
    <Card className="border-white/40 bg-white/70 shadow-2xl backdrop-blur-xl">
      <CardHeader className="items-center text-center">
        <div className="mb-1 flex size-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),var(--color-accent))] shadow-[0_8px_20px_-6px_color-mix(in_srgb,var(--color-primary)_55%,transparent)]">
          <BarChart3 className="size-7 text-white" />
        </div>
        <CardTitle className="text-xl font-semibold text-foreground">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter className="flex-col gap-3 pt-0">
        <div className="h-px w-full bg-border" />
        <div className="space-y-1 text-center text-[11px] text-muted-foreground/70">
          <p>
            {t("copyrightPrefix", { year: currentYear })}{" "}
            <a href="https://www.klickiteducation.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              {t("copyrightKlickit")}
            </a>
          </p>
          <p>
            {t("copyrightProductPrefix")}{" "}
            <a href="https://infoneysolutions.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              {t("copyrightInfoney")}
            </a>
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}

/**
 * Subtle frosted tint on fields sitting inside the glass card —
 * border/background only, no text-color override needed (see this file's
 * own doc comment). `border-white/50`/`bg-white/60` use literal `white`
 * (a real Tailwind built-in color, opacity modifiers work correctly on
 * it) — but `--muted-foreground`/`--primary` are raw hex-resolving CSS
 * vars like `--color-*`, so `text-muted-foreground/70`/`ring-primary/40`
 * would hit the exact same silently-broken-modifier trap this app has hit
 * repeatedly elsewhere (confirmed empirically: neither class generates
 * ANY compiled CSS rule at all, not just "opacity ignored" — verified via
 * `.next/static/css/app/layout.css` directly while root-causing the
 * sidebar's own instance of this same bug). `color-mix()` sidesteps it.
 */
export const authInputClass =
  "border-white/50 bg-white/60 placeholder:text-[color-mix(in_srgb,var(--muted-foreground)_70%,transparent)] focus-visible:ring-[color-mix(in_srgb,var(--primary)_40%,transparent)]";
/** Same gradient as the icon badge above, for visual continuity — matches the glow-shadow language `KpiCard`/`RowActionButton` already established this session. */
export const authSubmitButtonClass =
  "w-full rounded-full bg-[linear-gradient(135deg,var(--color-primary),var(--color-accent))] shadow-[0_8px_20px_-6px_color-mix(in_srgb,var(--color-primary)_55%,transparent)] hover:opacity-95";
