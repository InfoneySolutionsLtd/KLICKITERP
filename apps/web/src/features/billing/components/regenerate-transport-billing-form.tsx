"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { AcademicYearTermSelect } from "./academic-year-term-select";
import { useTerms } from "../hooks/use-academic-calendar";
import { useTransportRoutes } from "../hooks/use-transport-routes";
import { useRegenerateTransportBilling } from "../hooks/use-transport-billing";

const ALL_ROUTES_SENTINEL = "__all__";

interface RegenerateResultSummary {
  succeeded: { studentId: string; invoiceIds: string[]; routeId: string }[];
  failed: { studentId: string; error: string }[];
  skipped: { studentId: string; reason: string }[];
}

/**
 * "Regenerate" (like previous term) for Transport — the Transport
 * counterpart to the redesigned `bulk-billing-form.tsx` (Slice 49), NOT
 * `bill-transport-form.tsx` (that one is the heavier "pick class/route/
 * students by hand" workflow this feature exists to make unnecessary for
 * returning riders). Only a target term (+ optional route filter) is
 * picked — the student population is derived entirely server-side from who
 * actually had real transport billing in the preceding term, so unlike
 * Bulk Billing there is no "every active student in the school" unscoped
 * danger case possible here, and therefore no escalating danger-confirm
 * gate: this population is inherently bounded to returning riders.
 *
 * The preceding-term preview is resolved client-side with zero new
 * endpoint — `useTerms(academicYearId)` is the same hook
 * `<AcademicYearTermSelect>` already calls internally (same query key,
 * deduped), and each term's real `seq` is already on its response shape, so
 * a `useMemo` finds `seq - 1` locally, exactly mirroring
 * `bulk-billing-form.tsx`'s own derivation.
 */
export function RegenerateTransportBillingForm() {
  const t = useTranslations("billing.transportRoutes.regenerateForm");
  const tCommon = useTranslations("common");

  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [termId, setTermId] = React.useState<string | null>(null);
  const [routeId, setRouteId] = React.useState<string>(ALL_ROUTES_SENTINEL);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RegenerateResultSummary | null>(null);

  const routesQuery = useTransportRoutes();
  const termsQuery = useTerms(academicYearId ?? undefined);
  const regenerateMutation = useRegenerateTransportBilling();
  const submitting = regenerateMutation.isPending;

  const targetTerm = React.useMemo(() => termsQuery.data?.find((term) => term.id === termId), [termsQuery.data, termId]);
  const previousTerm = React.useMemo(
    () => (targetTerm && termsQuery.data ? termsQuery.data.find((term) => term.seq === targetTerm.seq - 1) : undefined),
    [targetTerm, termsQuery.data],
  );
  const noPreviousTerm = !!targetTerm && !!termsQuery.data && !previousTerm;

  function handleOpenConfirm() {
    setFormError(null);
    setResult(null);
    if (!termId) {
      setFormError(t("termRequiredError"));
      return;
    }
    if (noPreviousTerm && targetTerm) {
      setFormError(t("previousTermMissing", { termName: targetTerm.name }));
      return;
    }
    setConfirmError(null);
    setConfirmOpen(true);
  }

  function handleConfirmOpenChange(next: boolean) {
    if (submitting) return;
    setConfirmOpen(next);
  }

  async function handleConfirm() {
    if (!termId) return;
    setConfirmError(null);
    try {
      const response = await regenerateMutation.mutateAsync({
        termId,
        routeId: routeId === ALL_ROUTES_SENTINEL ? undefined : routeId,
      });
      setConfirmOpen(false);
      setResult({ succeeded: response.succeeded, failed: response.failed, skipped: response.skipped });
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("formTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          {submitting && (
            <Alert variant="warning">
              <AlertTitle>{t("inFlightNoticeTitle")}</AlertTitle>
              <AlertDescription>{t("inFlightNotice")}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label required>{t("termLabel")}</Label>
            <AcademicYearTermSelect
              academicYearId={academicYearId}
              termId={termId}
              onAcademicYearChange={setAcademicYearId}
              onTermChange={setTermId}
              yearPlaceholder={t("selectYear")}
              termPlaceholder={t("selectTerm")}
              autoSelectCurrent
              disabled={submitting}
            />
            {previousTerm && <p className="text-xs text-muted-foreground">{t("previousTermPreview", { termName: previousTerm.name })}</p>}
            {noPreviousTerm && targetTerm && (
              <p className="text-xs text-destructive">{t("previousTermMissing", { termName: targetTerm.name })}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("routeLabel")}</Label>
            <Select value={routeId} onValueChange={setRouteId} disabled={routesQuery.isLoading || submitting}>
              <SelectTrigger className="sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent searchable searchPlaceholder={tCommon("search")}>
                <SelectItem value={ALL_ROUTES_SENTINEL}>{t("allRoutes")}</SelectItem>
                {(routesQuery.data ?? []).map((route) => (
                  <SelectItem key={route.id} value={route.id}>
                    {route.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("routeHint")}</p>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleOpenConfirm} disabled={submitting || noPreviousTerm}>
              {submitting ? t("generating") : t("submit")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>{t("confirmBody", { previousTermName: previousTerm?.name ?? "" })}</DialogDescription>
          </DialogHeader>

          {confirmError && (
            <Alert variant="destructive">
              <AlertDescription>{confirmError}</AlertDescription>
            </Alert>
          )}

          {submitting && (
            <Alert variant="warning">
              <AlertTitle>{t("inFlightNoticeTitle")}</AlertTitle>
              <AlertDescription>{t("inFlightNotice")}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={submitting}>
              {submitting ? t("generating") : t("confirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("resultTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant={result.failed.length > 0 ? "warning" : "success"}>
              <AlertDescription>{t("succeededCount", { count: result.succeeded.length })}</AlertDescription>
            </Alert>

            {result.failed.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">{t("failedCount", { count: result.failed.length })}</p>
                <p className="mb-1 text-sm font-medium text-foreground">{t("failuresListTitle")}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {result.failed.map((f) => (
                    <li key={f.studentId}>
                      {f.studentId}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.skipped.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">{t("skippedCount", { count: result.skipped.length })}</p>
                <p className="mb-1 text-sm font-medium text-foreground">{t("skippedListTitle")}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {result.skipped.map((s) => (
                    <li key={s.studentId}>
                      {s.studentId}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
