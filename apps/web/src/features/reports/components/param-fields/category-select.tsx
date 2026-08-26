"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useCategories } from "@/features/expenses/hooks/use-categories";

/** Backs Expense Summary's `categoryId` param. Cross-feature import of `useCategories()`, same as `create-voucher-dialog.tsx`'s own inline combobox. */
export function CategorySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.category");
  const query = useCategories();

  const items = React.useMemo(
    () => (query.data ?? []).map((category) => ({ value: category.id, label: category.name })),
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
