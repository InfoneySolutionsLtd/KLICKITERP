"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useStockTakes } from "@/features/inventory/hooks/use-stock-takes";

/** Backs Stock Take Variance Report's `stockTakeId` param. */
export function StockTakeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.stockTake");
  const query = useStockTakes();

  const items = React.useMemo(
    () => (query.data ?? []).map((st) => ({ value: st.id, label: `${st.number} — ${st.status}` })),
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
