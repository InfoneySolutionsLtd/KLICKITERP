"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillTransportForm } from "@/features/billing/components/bill-transport-form";

/**
 * Transport Routes enhancement — the "Bill Transport" workflow: Year → Term
 * → Grade → Route → a route-aware student picker → optional wallet/credit
 * balance settlement → Generate Invoice. Reached only via the "Bill
 * Transport" button on the Transport Routes list page (no separate nav-menu
 * entry), same pattern `/billing/fee-structures` follows relative to Fee
 * Categories.
 */
export default function BillTransportPage() {
  const t = useTranslations("billing.transportRoutes.billForm");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/billing/transport-routes">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <BillTransportForm />
    </div>
  );
}
