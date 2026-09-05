"use client";

import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money";
import type { CashFlowResponse } from "@/types/dashboard";

/**
 * Phase 6 dashboard fix pass — replaces the previous raw `Object.entries`
 * text dump (`"5 line items — cashIn: 2096782.1000, cashOut: ..."`, real
 * decimal strings pasted straight into the DOM unformatted) with the same
 * money-formatting/typography discipline every other widget on this page
 * already uses. `totals` is optional on the wire type (an empty `rows`
 * genuinely has none — `CashFlowReport.execute()`'s own early-return case),
 * so this renders nothing rather than a misleading "KSh 0.00" row when it's
 * absent — the `isEmpty` check at the call site already handles the
 * zero-rows case before this component is even reached.
 */
export function CashFlowSummary({ totals }: { totals: CashFlowResponse["totals"] }) {
  const t = useTranslations("dashboard.cashFlow");
  if (!totals) return null;

  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <p className="text-xs text-muted-foreground">{t("cashIn")}</p>
        <p className="text-lg font-semibold tracking-tight text-success">{formatMoney(totals.cashIn)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{t("cashOut")}</p>
        <p className="text-lg font-semibold tracking-tight text-destructive">{formatMoney(totals.cashOut)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{t("netCashFlow")}</p>
        <p className="text-lg font-semibold tracking-tight">{formatMoney(totals.netCashFlow)}</p>
      </div>
    </div>
  );
}
