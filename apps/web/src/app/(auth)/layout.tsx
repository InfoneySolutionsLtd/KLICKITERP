import { getTranslations } from "next-intl/server";
import { getCurrentThemeServer } from "@/lib/theme-server";
import { buildSemanticLightVariables, toCssBlock } from "@/lib/theme";
import { SetupStatusGate } from "@/components/patterns/setup-status-gate";

/**
 * Server component shell for the public `/login` (and sibling) routes —
 * reads `loginConfig.welcomeText` from the same SSR theme fetch
 * `app/layout.tsx` already performed (a second cheap call, cached by
 * Next.js's fetch dedupe within the same request since it's the identical
 * URL). No SESSION guard here on purpose: this segment IS the public one.
 * It does, however, wrap `{children}` in `<SetupStatusGate>` — a client
 * island (same shape as `(erp)/layout.tsx`'s own `<AuthGuard>`) that
 * redirects to `/setup` whenever this instance has never had its first
 * System Admin provisioned, regardless of which `(auth)` route was
 * actually requested.
 *
 * Slice 1.5 (visual redesign, docs/phase-6/PROGRESS.md): two-column split on
 * `lg+` — a dark brand panel (reusing the exact `bg-brand-dark`/
 * `text-brand-surface` pairing sidebar.tsx already established for
 * on-dark-chrome content) alongside the centered, elevated auth card
 * (`login`/`change-password` inherit the restyled `Card` — `rounded-xl` +
 * `shadow-card` — with zero logic changes to either page). Collapses to a
 * single column below `lg` (brand panel hidden, the same centered-heading
 * treatment the single-column layout always had is kept for mobile).
 *
 * Slice (glassmorphism pass): the right-hand panel was a flat `bg-muted/40`
 * — now a brand gradient carrying the same decorative diamond motifs
 * `SidebarShell` established, so every `AuthCard` (`_components/auth-card.tsx`)
 * sitting on top of it reads as a deliberate glass panel rather than a plain
 * card floating on a gray background. Left brand panel is untouched.
 *
 * Slice (aurora background pass): the flat two-tone gradient read as plain,
 * not stylish — replaced with a layered "mesh gradient"/aurora look: three
 * large, softly blurred color blobs (`opacity-NN` + `blur-3xl`, a separate
 * CSS property from the background-color itself, so this works correctly
 * even though `bg-brand-*` resolves to a raw-hex CSS var — the same
 * mechanism the diamond motifs' own `opacity-[0.06]` already proves out)
 * using ONLY the tenant's own theme colors (`--color-accent`/`-secondary`/
 * `-primary-light`, never hardcoded hex), so a re-themed tenant gets a
 * re-colored aurora for free — plus a subtle dot-grid texture layer for
 * tactility, the same "on-dark-chrome surface tint" `color-mix()` idiom
 * `globals.css`'s sidebar-scrollbar rules already established, applied via
 * inline `style` (matching this file's own existing precedent for
 * `brandPanelStyle`) since a `radial-gradient()` + `background-size` pair
 * isn't cleanly expressible as a single Tailwind arbitrary-value class.
 *
 * **Real bug found and fixed live (a reported-from-production "white text,
 * invisible" issue on login/setup/verify)**: `app/providers.tsx`'s
 * `next-themes` `<ThemeProvider attribute="data-theme" defaultTheme="system"
 * enableSystem>` auto-applies `data-theme="dark"` to `<html>` whenever the
 * VISITOR'S OWN OS/browser prefers dark mode — app-wide, with no opt-out,
 * including this pre-login segment. `app/layout.tsx` injects BOTH a light
 * (`:root`) and a dark (`:root[data-theme="dark"]`) CSS-variable block; in
 * dark mode `--foreground`/`--muted-foreground` correctly flip to LIGHT
 * values (meant for the dashboard's own dark surfaces). `AuthCard`
 * (`_components/auth-card.tsx`) is a deliberately FIXED-light glass design
 * (`bg-white/70`, never meant to respond to dark mode at all — see that
 * file's own doc comment) that never opted out of this flip, so a visitor
 * in system dark mode got light/white text rendered against its hardcoded
 * light card: invisible, exactly as reported, on EVERY page this layout
 * wraps (login, setup, forgot/reset-password — matching the report of all
 * three being affected identically).
 *
 * Fixed by re-asserting the LIGHT semantic variable block, scoped to this
 * segment's own wrapper (`.auth-light-scope`, not `:root`) via a second
 * inline `<style>` — CSS custom properties cascade by DOM position, so a
 * more specific/inner declaration always wins over `<html data-theme="dark">`'s
 * `:root`-level one for every descendant, regardless of the visitor's
 * system preference or any `next-themes` state. Reuses the SAME already
 * server-fetched `theme` object (`getCurrentThemeServer()`, called once
 * per request, Next's fetch dedupe keeps this and `app/layout.tsx`'s own
 * call to one real network round trip) and the exact same
 * `buildSemanticLightVariables()` builder `app/layout.tsx` itself uses for
 * its own `:root` block — never a second, hand-duplicated color set that
 * could drift from the real theme.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [theme, t] = await Promise.all([getCurrentThemeServer(), getTranslations("shell")]);
  const welcomeText = theme.loginConfig.welcomeText ?? "Klickit Finance ERP";
  const authLightThemeCss = toCssBlock(".auth-light-scope", buildSemanticLightVariables(theme));
  // Slice 14 Part 3: `theme.loginBackgroundImageUrl` is a signed URL the
  // backend already resolved server-side (ThemesService, in-process
  // FilesService call) — this pre-auth page carries no bearer token at all,
  // so it could never have resolved `loginConfig.backgroundImageFileId`
  // itself. When unset, the panel stays exactly `bg-brand-dark` as today.
  const brandPanelStyle: React.CSSProperties = {
    fontFamily: "var(--font-family)",
    ...(theme.loginBackgroundImageUrl
      ? {
          backgroundImage: `url(${theme.loginBackgroundImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {}),
  };

  return (
    <div className="auth-light-scope flex min-h-screen flex-col lg:flex-row">
      {/* Trusted, server-generated CSS from our own theme builder, never user input — see this file's own doc comment above ("Real bug found and fixed live"). */}
      <style dangerouslySetInnerHTML={{ __html: authLightThemeCss }} />
      <div className="hidden flex-col justify-center gap-4 bg-brand-dark px-12 py-16 text-brand-surface lg:flex lg:w-1/2" style={brandPanelStyle}>
        <span className="text-2xl font-semibold">{t("productName")}</span>
        <p className="max-w-sm text-sm text-[color-mix(in_srgb,var(--color-surface)_70%,transparent)]">{welcomeText}</p>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(135deg,var(--color-primary),var(--color-dark))] px-4 py-12 lg:w-1/2">
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-brand-accent opacity-40 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-[22rem] w-[22rem] rounded-full bg-brand-secondary opacity-20 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-brand-primaryLight opacity-30 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--color-surface) 16%, transparent) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rotate-45 rounded-2xl border border-brand-surface opacity-[0.08]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rotate-45 rounded-2xl border border-brand-surface opacity-[0.06]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-[15%] top-[18%] h-14 w-14 rotate-45 rounded-lg border border-brand-surface opacity-[0.1]"
        />
        <div className="relative z-10 w-full max-w-md space-y-6">
          <div className="text-center lg:hidden">
            <h1 className="text-xl font-semibold text-white" style={{ fontFamily: "var(--font-family)" }}>
              {welcomeText}
            </h1>
          </div>
          <SetupStatusGate>{children}</SetupStatusGate>
        </div>
      </div>
    </div>
  );
}
