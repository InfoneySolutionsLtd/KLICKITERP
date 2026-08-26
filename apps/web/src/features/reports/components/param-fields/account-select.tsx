"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useAccounts } from "@/features/accounting/hooks/use-accounts";

/**
 * General Ledger's `accountId` needs ANY postable account, any class — not
 * `features/billing/components/gl-account-select.tsx`'s `GlAccountSelect`,
 * which is always class-scoped (INCOME or EXPENSE only). Built directly on
 * `features/accounting/hooks/use-accounts.ts`'s unfiltered `useAccounts()`
 * instead, matching the cross-feature-import pattern this hook already has
 * many real callers of (banking, inventory, fixed-assets, payroll, expenses).
 */
export function AccountSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.account");
  const query = useAccounts();

  const items = React.useMemo(
    () => (query.data ?? []).map((account) => ({ value: account.id, label: `${account.code} — ${account.name}` })),
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
