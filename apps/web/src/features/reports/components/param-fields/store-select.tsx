"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useStores } from "@/features/inventory/hooks/use-stores";

/** Backs Stock Balance Report's and Stock Movement Register's `storeId` param. */
export function StoreSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.store");
  const query = useStores();

  const items = React.useMemo(() => (query.data ?? []).map((store) => ({ value: store.id, label: store.name })), [query.data]);

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
