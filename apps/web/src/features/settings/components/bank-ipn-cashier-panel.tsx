"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useBankIpnReadiness, useSetBankIpnCashier } from "@/features/payments/hooks/use-bank-ipn";
import { useUsers } from "@/features/users/hooks/use-users";

/**
 * Bank payments are receipted automatically, and a receipt must record WHO took it. No human is involved, so the ERP
 * records a designated user (ideally a service account) — the Settings key `payments.bank_ipn_system_actor_user_id`.
 * Until one is set, every notification waits in Suspense instead of becoming a receipt. This panel shows that state
 * right where the bank connection is configured, and lets an administrator fix it on the spot.
 */
export function BankIpnCashierPanel() {
  const t = useTranslations("settings.integrations.kcbBuniForm.cashier");
  const readiness = useBankIpnReadiness();
  const setCashier = useSetBankIpnCashier();
  const [changing, setChanging] = React.useState(false);
  const [userId, setUserId] = React.useState("");
  // Only fetch the user list when the picker is actually on screen.
  const cashier = readiness.data?.cashier;
  const picking = changing || (cashier !== undefined && !cashier.configured);
  const usersQuery = useUsers({ status: "ACTIVE", pageSize: 200 });
  const userItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((user) => ({ value: user.id, label: user.fullName })),
    [usersQuery.data],
  );

  if (readiness.isLoading) return <p className="text-xs text-muted-foreground">{t("checking")}</p>;
  if (readiness.isError || !cashier) {
    // Most likely the signed-in user may configure integrations but not read settings — say so instead of guessing.
    return <p className="text-xs text-muted-foreground">{t("cannotCheck")}</p>;
  }

  async function save() {
    if (!userId) return;
    await setCashier.mutateAsync(userId);
    setChanging(false);
    setUserId("");
  }

  return (
    <div className="space-y-2" aria-live="polite">
      {cashier.configured ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          <span>{t("configured", { name: cashier.userName ?? "—" })}</span>
          {!changing && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(true)}>
              {t("change")}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-warning bg-tint-warning p-3 text-sm text-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">{cashier.userId && !cashier.userActive ? t("inactiveTitle") : t("missingTitle")}</p>
            <p className="text-muted-foreground">{cashier.userId && !cashier.userActive ? t("inactiveBody", { name: cashier.userName ?? "—" }) : t("missingBody")}</p>
          </div>
        </div>
      )}

      {picking && (
        <div className="space-y-2">
          <Combobox
            items={userItems}
            value={userId}
            onChange={setUserId}
            placeholder={usersQuery.isLoading ? t("loadingUsers") : t("pickPlaceholder")}
            searchPlaceholder={t("searchUsers")}
            emptyText={t("noUsers")}
            disabled={usersQuery.isLoading || setCashier.isPending}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => void save()} disabled={!userId || setCashier.isPending}>
              {setCashier.isPending ? t("saving") : t("save")}
            </Button>
            {changing && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(false)} disabled={setCashier.isPending}>
                {t("cancel")}
              </Button>
            )}
            <Link href="/users" className="text-xs text-primary hover:underline">
              {t("manageUsers")}
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">{t("pickHint")}</p>
        </div>
      )}
    </div>
  );
}
