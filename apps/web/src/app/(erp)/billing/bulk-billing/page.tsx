"use client";

import { useTranslations } from "next-intl";
import { BulkBillingForm } from "@/features/billing/components/bulk-billing-form";

/**
 * Phase 6 Billing sub-features batch, Part 8 (FINAL part) — Bulk Billing:
 * structure-driven mass invoice generation (`POST billing/bulk-billing/generate`,
 * distinct from the already-built ad-hoc bulk tool at `/billing/generate`,
 * which calls a different, category+student-scoped endpoint). A tool/action
 * page, not a list — no `[id]` detail route exists because no run persists
 * anywhere server-side to look back up (see `BulkBillingForm`'s own doc
 * comment for the full reasoning and its escalating confirm-dialog flow).
 * Reached from the Billing nav dropdown's "Bulk Billing" child
 * (`components/layout/nav-links.tsx`).
 */
export default function BulkBillingPage() {
  const t = useTranslations("billing.bulkBilling");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <BulkBillingForm />
    </div>
  );
}
