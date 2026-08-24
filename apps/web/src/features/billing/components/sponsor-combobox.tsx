"use client";

import * as React from "react";
import { Combobox } from "@/components/ui/combobox";
import { useSponsors } from "../hooks/use-sponsors";

/** Non-empty sentinel for a selectable "none" option — the base `<Combobox>` primitive has no built-in clear affordance, matching `class-stream-select.tsx`'s/`edit-account-dialog.tsx`'s own established `__none__` convention for a nullable single-select. */
const NONE_SENTINEL = "__none__";

/**
 * Part 1 (Billing sub-features batch) — a reusable single-select `Sponsor`
 * picker over `useSponsors()`'s full list, built on the generic `<Combobox>`
 * primitive the same way `CategoryCombobox`
 * (`features/fixed-assets/components/category-combobox.tsx`) wraps
 * `useCategories()`. Reused by later parts (Sponsor Awards' create dialog,
 * Concessions' request dialog) and by `student-form.tsx`'s new `sponsorId`
 * field this same part adds.
 *
 * `value`/`onChange` are nullable (`string | null`) — `sponsorId` is an
 * optional FK everywhere it's used, and this component owns its own
 * "none selected" affordance via `nullLabel` (when supplied, an extra
 * clearable option is shown) rather than pushing sentinel-juggling onto
 * every caller.
 */
export function SponsorCombobox({
  value,
  onChange,
  disabled,
  placeholder,
  searchPlaceholder,
  emptyText,
  loadingText,
  nullLabel,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
  /** Present -> a "none"/clear option is shown at the top of the list. Absent -> selection is effectively required (Sponsor Awards/Concessions usage). */
  nullLabel?: string;
}) {
  const sponsorsQuery = useSponsors();

  const items = React.useMemo(() => {
    const base = (sponsorsQuery.data ?? []).map((s) => ({ value: s.id, label: s.name }));
    return nullLabel ? [{ value: NONE_SENTINEL, label: nullLabel }, ...base] : base;
  }, [sponsorsQuery.data, nullLabel]);

  return (
    <Combobox
      items={items}
      value={value ?? (nullLabel ? NONE_SENTINEL : "")}
      onChange={(v) => onChange(v === NONE_SENTINEL ? null : v)}
      placeholder={sponsorsQuery.isLoading ? loadingText : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled || sponsorsQuery.isLoading}
    />
  );
}
