import { getTranslations } from "next-intl/server";
import { getCurrentThemeServer } from "@/lib/theme-server";
import { NavLinks } from "./nav-links";
import { SidebarShell } from "./sidebar-shell";

/**
 * Static chrome — a server component (per docs/phase-6/PROGRESS.md scope
 * item 7: "server component for static chrome, client islands for
 * session-aware bits"). Resolves the theme logo + product name string
 * server-side, same as always, and hands them to `<SidebarShell>` (a
 * client component — see its own doc comment) to actually render: collapse
 * state is genuinely interactive, which a server component cannot own, so
 * the `<aside>` markup itself now lives there instead of here.
 */
export async function Sidebar() {
  const [t, theme] = await Promise.all([getTranslations("shell"), getCurrentThemeServer()]);

  return (
    <SidebarShell logoUrl={theme.logoUrl ?? null} productName={t("productName")}>
      <NavLinks />
    </SidebarShell>
  );
}
