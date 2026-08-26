"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import type { ReportDefinitionResponseDto, ReportResultResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useReportDefinition } from "@/features/reports/hooks/use-catalogue";
import { useExecuteReport } from "@/features/reports/hooks/use-execute";
import { useCreateExportJob, useReportFileSignedUrl } from "@/features/reports/hooks/use-export";
import { useSavedParams, useUpdateSavedParams } from "@/features/reports/hooks/use-saved-params";
import { ReportParamsForm } from "@/features/reports/components/report-params-form";
import { ReportResultsTable } from "@/features/reports/components/report-results-table";
import { SaveParamsDialog } from "@/features/reports/components/save-params-dialog";
import { ScheduleReportDialog } from "@/features/reports/components/schedule-report-dialog";
import { buildExecuteParams, isParamsComplete } from "@/features/reports/lib/report-params";

/**
 * First non-uuid dynamic route segment in the app (no `[code]`/`[slug]`
 * precedent exists elsewhere) — same page shape as every `[id]` detail page
 * otherwise, just keyed by the report's string code.
 *
 * Run is a mutation (`useExecuteReport`), not a `useQuery` — every POST call
 * site in this codebase is a mutation, and a 403 (caller lacks that report's
 * own `reports:<code>:view`) surfaces via a local try/catch + `ApiError`
 * message, same as `voucher-status-actions.tsx`. Export always requests
 * `format: "CSV"` — CSV completes synchronously server-side (a real `fileId`
 * comes back in the same response); XLSX/PDF are queued-forever placeholders
 * and aren't offered here.
 */
function ReportDetailBody({ report, savedParamsId }: { report: ReportDefinitionResponseDto; savedParamsId: string | undefined }) {
  const t = useTranslations("reports.detail");
  const [paramValues, setParamValues] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<ReportResultResponseDto | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [updateSavedError, setUpdateSavedError] = React.useState<string | null>(null);
  const [updateSavedMessage, setUpdateSavedMessage] = React.useState<string | null>(null);

  const executeMutation = useExecuteReport();
  const exportMutation = useCreateExportJob();
  const signedUrlMutation = useReportFileSignedUrl();
  const savedParamsQuery = useSavedParams(savedParamsId);
  const updateSavedParamsMutation = useUpdateSavedParams();

  // Hydrate exactly once from a `?savedParamsId=` load — never re-runs once
  // `hydratedRef` flips, so it can't stomp a user's subsequent edits on a
  // later re-render (same guard `StudentParamField` uses for the identical
  // "external value set, one-time re-hydration" reason).
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (savedParamsQuery.data && !hydratedRef.current) {
      hydratedRef.current = true;
      setParamValues(savedParamsQuery.data.params as Record<string, string>);
    }
  }, [savedParamsQuery.data]);

  const paramsComplete = isParamsComplete(report.paramsShape, paramValues);
  const canRun = paramsComplete && !executeMutation.isPending;
  const exporting = exportMutation.isPending || signedUrlMutation.isPending;
  const loadedSavedParamsName = savedParamsQuery.data?.name;
  const updateMessageTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function handleRun() {
    if (!canRun) return;
    setRunError(null);
    try {
      const executed = await executeMutation.mutateAsync({ code: report.code, params: buildExecuteParams(paramValues) });
      setResult(executed);
    } catch (err) {
      setResult(null);
      setRunError(err instanceof ApiError ? err.message : t("runError"));
    }
  }

  async function handleExport() {
    if (!result) return;
    setExportError(null);
    try {
      const job = await exportMutation.mutateAsync({ reportCode: report.code, params: buildExecuteParams(paramValues), format: "CSV" });
      if (!job.fileId) {
        setExportError(t("exportError"));
        return;
      }
      const signed = await signedUrlMutation.mutateAsync(job.fileId);
      window.open(signed.url, "_blank", "noreferrer");
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : t("exportError"));
    }
  }

  /** Overwrites the ALREADY-loaded saved set's own `params` in place — no dialog needed, nothing new to ask (this is "Save", not "Save As"; `<SaveParamsDialog>` covers "Save As New" separately). */
  async function handleUpdateSavedParams() {
    if (!savedParamsId || !paramsComplete) return;
    setUpdateSavedError(null);
    clearTimeout(updateMessageTimeoutRef.current);
    try {
      await updateSavedParamsMutation.mutateAsync({ id: savedParamsId, params: buildExecuteParams(paramValues) });
      setUpdateSavedMessage(t("savedParamsUpdated"));
      updateMessageTimeoutRef.current = setTimeout(() => setUpdateSavedMessage(null), 3000);
    } catch (err) {
      setUpdateSavedError(err instanceof ApiError ? err.message : t("updateSavedParamsError"));
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{report.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("paramsTitle")}</p>
          {loadedSavedParamsName && <p className="text-xs text-muted-foreground">{t("editingSavedParams", { name: loadedSavedParamsName })}</p>}
          <ReportParamsForm report={report} value={paramValues} onChange={setParamValues} disabled={executeMutation.isPending} />
          {runError && (
            <Alert variant="destructive">
              <AlertDescription>{runError}</AlertDescription>
            </Alert>
          )}
          {updateSavedError && (
            <Alert variant="destructive">
              <AlertDescription>{updateSavedError}</AlertDescription>
            </Alert>
          )}
          {updateSavedMessage && (
            <Alert>
              <AlertDescription>{updateSavedMessage}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void handleRun()} disabled={!canRun}>
              {executeMutation.isPending ? t("running") : t("runButton")}
            </Button>
            {savedParamsId && (
              <Button type="button" variant="outline" onClick={() => void handleUpdateSavedParams()} disabled={!paramsComplete || updateSavedParamsMutation.isPending}>
                {updateSavedParamsMutation.isPending ? t("updatingSavedParams") : t("updateSavedParamsButton")}
              </Button>
            )}
            <SaveParamsDialog
              reportCode={report.code}
              params={buildExecuteParams(paramValues)}
              disabled={!paramsComplete}
              triggerLabel={loadedSavedParamsName ? t("saveParamsDialog.triggerAsNew") : undefined}
              initialName={loadedSavedParamsName ? t("saveParamsDialog.copyNameSuggestion", { name: loadedSavedParamsName }) : undefined}
            />
            <ScheduleReportDialog reportCode={report.code} params={buildExecuteParams(paramValues)} disabled={!paramsComplete} />
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base text-foreground">{t("resultsTitle")}</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {exporting ? t("exporting") : t("exportButton")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {exportError && (
              <Alert variant="destructive">
                <AlertDescription>{exportError}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">{t("generatedAtLabel", { date: new Date(result.generatedAt).toLocaleString() })}</p>
            <ReportResultsTable report={report} result={result} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** `useSearchParams()` (for the optional `?savedParamsId=` load) requires this component to sit inside a `<Suspense>` boundary in this Next.js version — same split shape `billing/collect/page.tsx`/`procurement/quotations/page.tsx` already establish. */
function ReportDetailPageContent() {
  const { code } = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const savedParamsId = searchParams.get("savedParamsId") ?? undefined;
  const t = useTranslations("reports.detail");
  const reportQuery = useReportDefinition(code);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/reports">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={reportQuery}>{(report) => <ReportDetailBody report={report} savedParamsId={savedParamsId} />}</QueryBoundary>
    </div>
  );
}

export default function ReportDetailPage() {
  return (
    <React.Suspense fallback={null}>
      <ReportDetailPageContent />
    </React.Suspense>
  );
}
