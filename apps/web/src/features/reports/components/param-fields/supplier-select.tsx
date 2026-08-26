"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useSuppliers } from "@/features/procurement/hooks/use-suppliers";

/** Backs Supplier Statement's `supplierId` param. Cross-feature import of `useSuppliers()`, mirroring the same inline combobox pattern already used in 3 other dialogs (PO/supplier-invoice/voucher creation). */
export function SupplierSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.supplier");
  const query = useSuppliers();

  const items = React.useMemo(
    () => (query.data ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name })),
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
