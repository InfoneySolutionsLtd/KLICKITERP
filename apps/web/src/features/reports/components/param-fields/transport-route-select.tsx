"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useTransportRoutes } from "@/features/billing/hooks/use-transport-routes";

/** Backs the Vehicle Expense report's `routeId` param. `TransportRouteResponseDto.bus` is a gapped `Record<string, never> | null` in the generated type (missing an explicit `@ApiProperty({type: String})` server-side, same class of gap as `ScheduleResponseDto.recipients`/`lastOk`) — the real wire value is `string | null`, cast here for display. */
export function TransportRouteSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.transportRoute");
  const query = useTransportRoutes();

  const items = React.useMemo(
    () =>
      (query.data ?? []).map((route) => {
        const bus = route.bus as unknown as string | null;
        return { value: route.id, label: bus ? `${route.name} — ${bus}` : route.name };
      }),
    [query.data],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={query.isLoading ? t("loading") : t("placeholder")}
      searchPlaceholder={t("searchPlaceholder")}
      emptyText={t("empty")}
      disabled={disabled || query.isLoading}
    />
  );
}
