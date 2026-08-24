"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { ConcessionSchemeResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useAccount as useGlAccount } from "@/features/accounting/hooks/use-accounts";
import { useFeeCategories } from "@/features/billing/hooks/use-fee-categories";
import {
  useActivateConcessionScheme,
  useConcessionScheme,
  useDeactivateConcessionScheme,
} from "@/features/billing/hooks/use-concession-schemes";
import { ConcessionSchemeDialog } from "@/features/billing/components/concession-scheme-dialog";

/**
 * Part 1 (Billing sub-features batch) — a concession scheme's detail page:
 * header (name, status badge, Edit + Activate/Deactivate) and a details grid
 * (kind, calc, value, categoryScope resolved to fee-category names,
 * allowsStacking, the GL account resolved to `code — name`) — same
 * `useParams<{id}>()` + `<QueryBoundary>` header-card shape
 * `fixed-assets/categories/[id]/page.tsx` establishes.
 */
export default function ConcessionSchemeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("billing.concessionSchemes.detail");
  const schemeQuery = useConcessionScheme(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/billing/concession-schemes">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={schemeQuery}>{(scheme) => <SchemeDetailCard scheme={scheme} />}</QueryBoundary>
    </div>
  );
}

function SchemeDetailCard({ scheme }: { scheme: ConcessionSchemeResponseDto }) {
  const t = useTranslations("billing.concessionSchemes.detail");
  const tKinds = useTranslations("billing.concessionSchemes.kindValues");
  const tCalcs = useTranslations("billing.concessionSchemes.calcValues");
  const tCommon = useTranslations("common");

  const [editOpen, setEditOpen] = React.useState(false);
  const glAccountQuery = useGlAccount(scheme.glAccountId);
  const feeCategoriesQuery = useFeeCategories();
  const deactivateMutation = useDeactivateConcessionScheme();
  const activateMutation = useActivateConcessionScheme();

  const glAccountLabel = glAccountQuery.data ? `${glAccountQuery.data.code} — ${glAccountQuery.data.name}` : scheme.glAccountId;

  const categoryScopeLabel = React.useMemo(() => {
    if (!scheme.categoryScope || scheme.categoryScope.length === 0) return t("categoryScopeAll");
    const byId = new Map((feeCategoriesQuery.data ?? []).map((c) => [c.id, c.name]));
    return scheme.categoryScope.map((catId) => byId.get(catId) ?? catId).join(", ");
  }, [scheme.categoryScope, feeCategoriesQuery.data, t]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base text-foreground">{scheme.name}</CardTitle>
            <Badge variant={scheme.isActive ? "soft-success" : "soft-destructive"}>
              {scheme.isActive ? tCommon("active") : tCommon("inactive")}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            {tCommon("edit")}
          </Button>
          {scheme.isActive ? (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-tint-destructive hover:text-destructive"
              disabled={deactivateMutation.isPending}
              onClick={() => deactivateMutation.mutate(scheme.id)}
            >
              {t("deactivate")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={activateMutation.isPending} onClick={() => activateMutation.mutate(scheme.id)}>
              {t("activate")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("kindLabel")}</p>
            <p className="text-sm text-foreground">{tKinds(scheme.kind)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("calcLabel")}</p>
            <p className="text-sm text-foreground">{tCalcs(scheme.calc)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("valueLabel")}</p>
            <p className="text-sm text-foreground">{scheme.value}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("categoryScopeLabel")}</p>
            <p className="text-sm text-foreground">{categoryScopeLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("allowsStackingLabel")}</p>
            <p className="text-sm text-foreground">{scheme.allowsStacking ? tCommon("active") : "—"}</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("glAccountLabel")}</p>
          <p className="text-sm text-foreground">{glAccountLabel}</p>
        </div>
      </CardContent>

      <ConcessionSchemeDialog mode="edit" scheme={scheme} open={editOpen} onOpenChange={setEditOpen} />
    </Card>
  );
}
