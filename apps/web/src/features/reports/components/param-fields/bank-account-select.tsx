"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useAccounts } from "@/features/banking/hooks/use-accounts";

/**
 * Backs the 3 new banking reports' `bankAccountId` param — named
 * `bankAccountId`, not `accountId`, deliberately: `accountId` is already
 * claimed by `AccountSelect` (GL accounts, a different entity kind) in
 * `UUID_PARAM_PICKERS`. `GET /banking/accounts` is `banking:account:manage`-
 * gated (confirmed real, no narrower read-only permission exists on this
 * controller) — a role granted only these reports' own view permissions will
 * need that permission granted too to populate this picker, the same class
 * of prerequisite every other reports permission grant already carries.
 */
export function BankAccountSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.pickers.bankAccount");
  const query = useAccounts();

  const items = React.useMemo(
    () =>
      (query.data ?? []).map((account) => ({
        value: account.id,
        label: account.bankName ? `${account.name} — ${account.bankName}` : account.name,
      })),
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
