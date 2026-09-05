"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RegenerateTransportBillingForm } from "@/features/billing/components/regenerate-transport-billing-form";

/**
 * "Regenerate" (like previous term) transport billing — reached only via the
 * "Regenerate" button on the Transport Routes list page (no separate
 * nav-menu entry), mirroring `.../bill/page.tsx`'s own thin-wrapper shape
 * exactly.
 */
export default function RegenerateTransportBillingPage() {
  const t = useTranslations("billing.transportRoutes.regenerateForm");

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

      <RegenerateTransportBillingForm />
    </div>
  );
}
