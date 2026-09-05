import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export type RowActionTone = "view" | "edit" | "delete";

/**
 * Table-row action buttons redesign — the same gradient-fill + soft
 * `color-mix()`-derived glow language `<KpiCard>`/`<DashboardCard>`'s own
 * icon badges already established for the dashboard, brought to the
 * "View"/"Edit"/"Delete" row actions used across every list page in the
 * app. Deliberately its OWN primitive rather than a new `<Button>` variant
 * — `<Button>`'s shape (rectangular, `gap-2` for an icon+label pair) is
 * wrong for this: these are ICON-ONLY circular badges with no visible
 * label (the label becomes `aria-label`/`title` instead, a native hover
 * tooltip — same "reliable over cleverer" choice `nav-links.tsx`'s own
 * collapsed-sidebar tooltips already made, for the same reason: a custom
 * absolutely-positioned tooltip risks being clipped by table/card
 * `overflow` ancestors, a native one never is).
 *
 * `children` (the icon), not an `icon` prop — matches `<Button>`'s own
 * `asChild` shape exactly (`<Button asChild><Link>...</Link></Button>`),
 * for a real reason, not just consistency: `asChild` renders via Radix's
 * `<Slot>`, which clones this component's props onto ITS OWN single
 * child — if the icon were rendered as a hardcoded child INSIDE this
 * component's own JSX instead, `asChild`'s target (e.g. a `<Link>`) would
 * never actually reach the DOM; only `<Slot>`'s literal children control
 * what gets rendered when `asChild` is used. An earlier version of this
 * component got exactly this wrong (hardcoded `<Icon/>` as this
 * component's own children, silently dropping the caller's `<Link>` even
 * though its `href` still "existed" as an unused prop) — caught in review
 * before it ever shipped to a real page.
 *
 * `color-mix()` (not a Tailwind `/NN` opacity modifier) for the same
 * reason every other tinted effect in this app uses it: this app's colors
 * are raw `var(--x)` CSS custom properties, which the modifier syntax
 * silently no-ops on.
 */
const TONE_GRADIENT: Record<RowActionTone, string> = {
  view: "bg-[linear-gradient(135deg,var(--color-primary),var(--tint-primary))]",
  edit: "bg-[linear-gradient(135deg,var(--warning),var(--tint-warning))]",
  delete: "bg-[linear-gradient(135deg,var(--destructive),var(--tint-destructive))]",
};

const TONE_SHADOW: Record<RowActionTone, string> = {
  view: "shadow-[0_3px_10px_-3px_color-mix(in_srgb,var(--color-primary)_50%,transparent)]",
  edit: "shadow-[0_3px_10px_-3px_color-mix(in_srgb,var(--warning)_50%,transparent)]",
  delete: "shadow-[0_3px_10px_-3px_color-mix(in_srgb,var(--destructive)_50%,transparent)]",
};

export interface RowActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone: RowActionTone;
  /** Required, not optional — this button has no visible text of its own, so its accessible name AND its native hover tooltip both come from here (`aria-label` + `title`). */
  label: string;
  asChild?: boolean;
}

export const RowActionButton = React.forwardRef<HTMLButtonElement, RowActionButtonProps>(
  ({ tone, label, asChild = false, className, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-brand-surface transition-transform duration-150 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100 print:hidden [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          TONE_GRADIENT[tone],
          TONE_SHADOW[tone],
          className,
        )}
        {...props}
      />
    );
  },
);
RowActionButton.displayName = "RowActionButton";
