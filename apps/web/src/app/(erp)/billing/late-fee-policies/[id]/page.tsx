"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Ban, CheckCircle2 } from "lucide-react";
import type { LateFeePolicyResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useActivateLateFeePolicy, useDeactivateLateFeePolicy, useLateFeePolicy } from "@/features/billing/hooks/use-late-fee-policies";
import { LateFeePolicyDialog } from "@/features/billing/components/late-fee-policy-dialog";

/**
 * A late-fee policy's detail page: header `Card` (name, active/inactive
 * badge, Edit dialog trigger, direct-click Activate/Deactivate — no confirm
 * dialog, matching `cost-centers/page.tsx`'s/`suppliers/[id]/page.tsx`'s own
 * "no-body POST action = direct click" precedent) plus a details section
 * rendering `params` MODE-AWARE: a real formatted tiers table for TIERED, a
 * single formatted value for FLAT/PERCENT — never a raw JSON dump. Same
 * `useParams<{id:string}>()` + `<QueryBoundary>` header-card shape
 * `accounting/budgets/[id]/page.tsx`/`fixed-assets/categories/[id]/page.tsx`
 * already establish.
 */
export default function LateFeePolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("billing.lateFeePolicies.detail");
  const policyQuery = useLateFeePolicy(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/billing/late-fee-policies">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={policyQuery}>{(policy) => <PolicyDetailCard policy={policy} />}</QueryBoundary>
    </div>
  );
}

function PolicyDetailCard({ policy }: { policy: LateFeePolicyResponseDto }) {
  const t = useTranslations("billing.lateFeePolicies.detail");
  const tModes = useTranslations("billing.lateFeePolicies.modeValues");
  const tCommon = useTranslations("common");
  const [editOpen, setEditOpen] = React.useState(false);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const deactivateMutation = useDeactivateLateFeePolicy();
  const activateMutation = useActivateLateFeePolicy();

  async function handleToggleStatus() {
    setStatusError(null);
    try {
      if (policy.isActive) {
        await deactivateMutation.mutateAsync(policy.id);
      } else {
        await activateMutation.mutateAsync(policy.id);
      }
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : t("statusToggleError"));
    }
  }

  const togglePending = deactivateMutation.isPending || activateMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{policy.name}</CardTitle>
              <Badge variant={policy.isActive ? "soft-success" : "soft-destructive"}>
                {policy.isActive ? tCommon("active") : tCommon("inactive")}
              </Badge>
              <Badge variant="soft-secondary">{tModes(policy.mode)}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
              {tCommon("edit")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleToggleStatus()} disabled={togglePending}>
              {policy.isActive ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
              {policy.isActive ? t("deactivate") : t("activate")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusError && (
            <Alert variant="destructive">
              <AlertDescription>{statusError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("graceDaysLabel")}</p>
              <p className="text-sm text-foreground">{t("graceDaysValue", { count: policy.graceDays })}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("requiresApprovalLabel")}</p>
              <p className="text-sm text-foreground">{policy.requiresApproval ? tCommon("active") : "—"}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("paramsLabel")}</p>
            <ParamsView policy={policy} />
          </div>
        </CardContent>
      </Card>

      <LateFeePolicyDialog mode="edit" policy={policy} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

function ParamsView({ policy }: { policy: LateFeePolicyResponseDto }) {
  const t = useTranslations("billing.lateFeePolicies.detail");

  if (policy.mode === "FLAT") {
    const amount = typeof policy.params.amount === "string" ? policy.params.amount : null;
    return <p className="text-sm text-foreground">{amount !== null ? formatMoney(amount) : "—"}</p>;
  }

  if (policy.mode === "PERCENT") {
    const rate = typeof policy.params.rate === "string" ? policy.params.rate : null;
    return <p className="text-sm text-foreground">{rate ?? "—"}</p>;
  }

  const tiers = Array.isArray(policy.params.tiers) ? (policy.params.tiers as Record<string, unknown>[]) : [];
  if (tiers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noTiers")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("minDaysOverdue")}</TableHead>
            <TableHead>{t("maxDaysOverdue")}</TableHead>
            <TableHead>{t("tierAmount")}</TableHead>
            <TableHead>{t("tierRate")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.map((tier, index) => (
            <TableRow key={index}>
              <TableCell>{typeof tier.minDaysOverdue === "number" ? tier.minDaysOverdue : "—"}</TableCell>
              <TableCell>{typeof tier.maxDaysOverdue === "number" ? tier.maxDaysOverdue : t("openEnded")}</TableCell>
              <TableCell>{typeof tier.amount === "string" ? formatMoney(tier.amount) : "—"}</TableCell>
              <TableCell>{typeof tier.rate === "string" ? tier.rate : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
