"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { listStreamsForClass } from "@/features/students/api/streams.api";
import { useClasses } from "@/features/students/hooks/use-classes";
import { AcademicYearTermSelect } from "./academic-year-term-select";
import { useBulkBilling } from "../hooks/use-bulk-billing";

/**
 * A fixed, un-translated safety token the admin must type verbatim (case-
 * insensitive) to unlock the Confirm button on the unscoped/danger path —
 * kept constant across every locale (interpolated INTO each locale's own
 * translated instruction text via `{word}`, not translated itself) so the
 * comparison in `dangerConfirmed` below never depends on translation
 * fidelity.
 */
const DANGER_CONFIRM_WORD = "BILL ALL STUDENTS";

interface BulkBillingSummary {
  succeeded: string[];
  failed: { studentId: string; error: string }[];
}

/**
 * Phase 6 Billing sub-features batch, Part 8 (FINAL part) — Bulk Billing's
 * main form: `<AcademicYearTermSelect>` for the required `termId`, a
 * `classIds` `<MultiSelect>` (copying `fee-structure-create-dialog.tsx`'s
 * own existing multi-class-picker pattern verbatim — `useClasses()` +
 * `MultiSelect`, no new infrastructure invented), and a `streamIds`
 * `<MultiSelect>` populated as the UNION of `listStreamsForClass(classId)`
 * calls across whichever classes are currently selected (`useQueries()`,
 * the same fan-out pattern `integrity-run-findings.tsx` already
 * establishes) — there is no unscoped "list all streams" endpoint anywhere
 * in this codebase (`StreamsController.listByClass()` requires `classId`,
 * confirmed by reading it directly), so the streams picker is empty/disabled
 * with an explanatory hint whenever zero classes are selected; a `useEffect`
 * prunes any selected stream id that falls out of the current union whenever
 * the class selection changes, so a stale stream id is never silently sent.
 * A direct, structural consequence of this pruning: `streamIds` can never be
 * non-empty while `classIds` is empty through this UI, so the "unscoped"
 * check below only needs to look at `classIds`, but checks both anyway for
 * defense in depth against a future change to that invariant.
 *
 * **The escalating confirm flow — this component's real reason for
 * existing.** `BulkBillingService.resolveStudents()`
 * (`packages/server/.../bulk-billing.service.ts`, confirmed by reading it
 * directly) treats an empty `classIds` AND empty `streamIds` as "every
 * ACTIVE student in the entire school," with zero server-side confirmation
 * step of its own — this dialog is the ONLY thing standing between a
 * misclick and billing an entire school:
 *   - **Scoped** (at least one class or stream selected): a plain `Dialog`
 *     confirm, default button variant, describing the real scope about to be
 *     billed.
 *   - **Unscoped** (both empty): the SAME `Dialog`, but the title/button go
 *     `variant="destructive"`, a `variant="destructive"` `Alert` spells out
 *     "every active student in the school, no undo" in plain language, and —
 *     going further than `budget-status-actions.tsx`'s own
 *     precedent-setting "elevate the warning based on a computed condition"
 *     pattern, which stops at a destructive `Alert` — the Confirm button
 *     stays disabled until the admin types `DANGER_CONFIRM_WORD` verbatim
 *     into a real `Input`, matching the stakes (unbounded, un-undoable,
 *     whole-school blast radius) rather than a plain destructive button
 *     alone.
 *
 * **No persisted tracking row exists for a run anywhere server-side**
 * (confirmed via `bulk-billing.api.ts`'s own doc comment) — the result is
 * rendered inline the moment the mutation resolves, this component never
 * navigates away from it, and a visible "do not navigate away" `Alert`
 * appears both on the main card and inside the confirm dialog itself
 * whenever the mutation is actually in flight (`isPending`), copying
 * `bulk-generate-invoice-form.tsx`'s own established
 * Alert+`<ul>`-of-`{studentId}: {error}"` result-rendering shape for the
 * failures list.
 */
export function BulkBillingForm() {
  const t = useTranslations("billing.bulkBilling");
  const tCommon = useTranslations("common");

  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [termId, setTermId] = React.useState<string | null>(null);
  const [classIds, setClassIds] = React.useState<string[]>([]);
  const [streamIds, setStreamIds] = React.useState<string[]>([]);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [dangerConfirmText, setDangerConfirmText] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BulkBillingSummary | null>(null);

  const classesQuery = useClasses();
  const bulkBillingMutation = useBulkBilling();
  const submitting = bulkBillingMutation.isPending;

  const classOptions = React.useMemo(
    () => (classesQuery.data ?? []).map((klass) => ({ value: klass.id, label: klass.name })),
    [classesQuery.data],
  );

  const streamsQueries = useQueries({
    queries: classIds.map((classId) => ({
      // Same query key shape `use-streams.ts`'s own `useStreamsForClass()`
      // uses — deliberately shared, so this rides the same cache entry that
      // hook already populates elsewhere in the app rather than duplicating it.
      queryKey: ["students", "streams", classId] as const,
      queryFn: () => listStreamsForClass(classId),
    })),
  });
  const streamsLoading = classIds.length > 0 && streamsQueries.some((q) => q.isLoading);
  const streamOptions = React.useMemo(() => {
    const byId = new Map<string, string>();
    for (const q of streamsQueries) {
      for (const stream of q.data ?? []) byId.set(stream.id, stream.name);
    }
    return Array.from(byId.entries()).map(([value, label]) => ({ value, label }));
  }, [streamsQueries]);

  // A class deselected out from under a chosen stream must drop that stream too — never silently
  // send a stream id for a class that's no longer part of the current scope.
  React.useEffect(() => {
    setStreamIds((prev) => prev.filter((id) => streamOptions.some((o) => o.value === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIds]);

  const isUnscoped = classIds.length === 0 && streamIds.length === 0;
  const dangerConfirmed = dangerConfirmText.trim().toUpperCase() === DANGER_CONFIRM_WORD;

  function handleOpenConfirm() {
    setFormError(null);
    setResult(null);
    if (!termId) {
      setFormError(t("form.termRequiredError"));
      return;
    }
    setConfirmError(null);
    setDangerConfirmText("");
    setConfirmOpen(true);
  }

  function handleConfirmOpenChange(next: boolean) {
    if (submitting) return; // never let the dialog close itself while the request is in flight
    setConfirmOpen(next);
  }

  async function handleConfirm() {
    if (!termId) return;
    setConfirmError(null);
    try {
      const response = await bulkBillingMutation.mutateAsync({
        termId,
        classIds: classIds.length > 0 ? classIds : undefined,
        streamIds: streamIds.length > 0 ? streamIds : undefined,
      });
      setConfirmOpen(false);
      setResult({ succeeded: response.succeeded, failed: response.failed });
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : t("form.genericError"));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("form.formTitle")}</CardTitle>
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
            <Label required>{t("form.termLabel")}</Label>
            <AcademicYearTermSelect
              academicYearId={academicYearId}
              termId={termId}
              onAcademicYearChange={setAcademicYearId}
              onTermChange={setTermId}
              yearPlaceholder={t("form.selectYear")}
              termPlaceholder={t("form.selectTerm")}
              autoSelectCurrent
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("form.classesLabel")}</Label>
            <MultiSelect
              options={classOptions}
              selected={classIds}
              onChange={setClassIds}
              placeholder={t("form.selectClasses")}
              disabled={classesQuery.isLoading || submitting}
              className="sm:w-96"
            />
            <p className="text-xs text-muted-foreground">{t("form.classesHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("form.streamsLabel")}</Label>
            <MultiSelect
              options={streamOptions}
              selected={streamIds}
              onChange={setStreamIds}
              placeholder={t("form.selectStreams")}
              disabled={classIds.length === 0 || streamsLoading || submitting}
              className="sm:w-96"
            />
            <p className="text-xs text-muted-foreground">
              {classIds.length === 0 ? t("form.streamsDisabledHint") : t("form.streamsHint")}
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleOpenConfirm} disabled={submitting}>
              {submitting ? t("form.generating") : t("form.submit")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
        <DialogContent>
          {isUnscoped ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-destructive">{t("confirmDialog.dangerTitle")}</DialogTitle>
                <DialogDescription>{t("confirmDialog.dangerBody")}</DialogDescription>
              </DialogHeader>

              <Alert variant="destructive">
                <AlertTitle>{t("confirmDialog.dangerAlertTitle")}</AlertTitle>
                <AlertDescription>{t("confirmDialog.dangerAlertBody")}</AlertDescription>
              </Alert>

              <div className="space-y-1.5">
                <Label required>{t("confirmDialog.typeToConfirmLabel", { word: DANGER_CONFIRM_WORD })}</Label>
                <Input
                  value={dangerConfirmText}
                  onChange={(e) => setDangerConfirmText(e.target.value)}
                  placeholder={DANGER_CONFIRM_WORD}
                  autoComplete="off"
                  disabled={submitting}
                />
              </div>
            </>
          ) : (
            <DialogHeader>
              <DialogTitle>{t("confirmDialog.normalTitle")}</DialogTitle>
              <DialogDescription>
                {t("confirmDialog.normalBody", { classCount: classIds.length, streamCount: streamIds.length })}
              </DialogDescription>
            </DialogHeader>
          )}

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
            <Button
              type="button"
              variant={isUnscoped ? "destructive" : "default"}
              onClick={() => void handleConfirm()}
              disabled={submitting || (isUnscoped && !dangerConfirmed)}
            >
              {submitting ? t("form.generating") : t("confirmDialog.confirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("result.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant={result.failed.length > 0 ? "warning" : "success"}>
              <AlertDescription>{t("result.succeededCount", { count: result.succeeded.length })}</AlertDescription>
            </Alert>

            {result.failed.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">{t("result.failedCount", { count: result.failed.length })}</p>
                <p className="mb-1 text-sm font-medium text-foreground">{t("result.failuresListTitle")}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {result.failed.map((f) => (
                    <li key={f.studentId}>
                      {f.studentId}: {f.error}
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
