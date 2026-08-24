"use client";

import * as React from "react";
import { Combobox } from "@/components/ui/combobox";
import { useTransportRoutes } from "../hooks/use-transport-routes";

/** Same `__none__` sentinel convention as `sponsor-combobox.tsx`/`class-stream-select.tsx`/`edit-account-dialog.tsx` — see that file's own doc comment. */
const NONE_SENTINEL = "__none__";

/**
 * Part 1 (Billing sub-features batch) — a reusable single-select
 * `TransportRoute` picker over `useTransportRoutes()`'s full list, the same
 * `<Combobox>`-wrapping shape as `SponsorCombobox`/`CategoryCombobox`. Used
 * by `student-form.tsx`'s new `transportRouteId` field this same part adds.
 * Labels each item `name — amount` (the route's flat fee), purely
 * informational — `bill_transport_route.amount` is never auto-billed, see
 * `transport-routes.api.ts`'s own doc comment.
 */
export function TransportRouteCombobox({
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
  /** Present -> a "none"/clear option is shown at the top of the list. */
  nullLabel?: string;
}) {
  const routesQuery = useTransportRoutes();

  const items = React.useMemo(() => {
    const base = (routesQuery.data ?? []).map((r) => ({ value: r.id, label: `${r.name} — ${r.amount}` }));
    return nullLabel ? [{ value: NONE_SENTINEL, label: nullLabel }, ...base] : base;
  }, [routesQuery.data, nullLabel]);

  return (
    <Combobox
      items={items}
      value={value ?? (nullLabel ? NONE_SENTINEL : "")}
      onChange={(v) => onChange(v === NONE_SENTINEL ? null : v)}
      placeholder={routesQuery.isLoading ? loadingText : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled || routesQuery.isLoading}
    />
  );
}
