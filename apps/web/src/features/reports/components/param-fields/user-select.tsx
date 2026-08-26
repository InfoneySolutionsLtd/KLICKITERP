"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useUsersLookup } from "../../hooks/use-users-lookup";

/** Backs Audit Log's `actorId` param. */
export function UserSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.user");
  const query = useUsersLookup();

  const items = React.useMemo(
    () => (query.data?.items ?? []).map((user) => ({ value: user.id, label: `${user.fullName} (${user.username})` })),
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
