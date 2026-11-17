"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import type { AcademySyncRunDto, AcademySyncStatusDto } from "../api/academy-sync.api";
import { useAcademySyncStatus, useSetAcademyAutoSync, useStartAcademySyncRun } from "../hooks/use-academy-sync";

/** Issues drawn on screen; the run keeps up to 500 and always reports the true total. */
const ISSUE_ROWS_SHOWN = 50;

/** Counts always shown, in this order — the headline numbers of a run. */
const MAIN_COUNTS = ["seen", "created", "linked", "updated", "unchanged", "skipped"] as const;
/** Counts shown only when non-zero. */
const EXTRA_COUNTS = [
  "removed",
  "missing",
  "guardiansCreated",
  "guardiansAdopted",
  "guardiansLinked",
  "classesCreated",
  "streamsCreated",
  "errors",
] as const;

/** Issue codes the server can raise; anything else falls back to the raw code. */
const KNOWN_ISSUE_CODES = new Set([
  "NO_ADMISSION_NUMBER",
  "NAME_INCOMPLETE",
  "NO_CLASS",
  "ADMISSION_NO_CONFLICT",
  "ADMISSION_NO_CHANGED",
  "CLASS_MISMATCH",
  "STATUS_CHANGED",
  "REMOVED_IN_ACADEMY",
  "MISSING_FROM_ACADEMY",
  "PARENT_NO_CONTACT",
  "ERROR",
]);

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/** The most recent of the runs, so the result panel shows what just happened rather than something old. */
function latestRun(status: AcademySyncStatusDto): AcademySyncRunDto | null {
  const runs = [status.runningRun, status.lastPreview, status.lastImport].filter((run): run is AcademySyncRunDto => run !== null);
  if (runs.length === 0) return null;
  return runs.reduce((latest, run) => (new Date(run.startedAt) > new Date(latest.startedAt) ? run : latest));
}

function RunResult({ run }: { run: AcademySyncRunDto }) {
  const t = useTranslations("academySync");
  const extra = EXTRA_COUNTS.filter((key) => (run.counts[key] ?? 0) > 0);

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {run.mode === "PREVIEW" ? t("result.previewTitle") : t("result.importTitle")}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={run.status === "SUCCEEDED" ? "soft-success" : run.status === "FAILED" ? "soft-destructive" : "soft-primary"}>
            {t(`result.status.${run.status}`)}
          </Badge>
          <span>{formatDateTime(run.finishedAt ?? run.startedAt)}</span>
        </div>
      </div>

      {run.status === "RUNNING" && <p className="text-sm text-muted-foreground">{t("result.running")}</p>}

      {run.status === "FAILED" && (
        <Alert variant="destructive">
          <AlertDescription>{t("result.failed", { error: run.error ?? "—" })}</AlertDescription>
        </Alert>
      )}

      {run.status === "SUCCEEDED" && (
        <>
          {run.mode === "PREVIEW" && <p className="text-xs text-muted-foreground">{t("result.previewNote")}</p>}
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {MAIN_COUNTS.map((key) => (
              <div key={key} className="space-y-0.5">
                <dt className="text-xs text-muted-foreground">{t(`counts.${key}`)}</dt>
                <dd className="text-lg font-semibold text-foreground">{run.counts[key] ?? 0}</dd>
              </div>
            ))}
          </dl>
          {extra.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {extra.map((key) => (
                <li key={key}>
                  {t(`counts.${key}`)}: <span className="font-medium text-foreground">{run.counts[key]}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {run.issuesTotal > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">{t("issues.title", { total: run.issuesTotal })}</h4>
          <p className="text-xs text-muted-foreground">{t("issues.hint")}</p>
          <div className="max-h-96 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("issues.what")}</TableHead>
                  <TableHead>{t("issues.student")}</TableHead>
                  <TableHead>{t("issues.admissionNo")}</TableHead>
                  <TableHead>{t("issues.details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.issues.slice(0, ISSUE_ROWS_SHOWN).map((issue, index) => (
                  <TableRow key={`${issue.code}-${issue.academyStudentId ?? "x"}-${index}`}>
                    <TableCell className="whitespace-nowrap align-top">
                      <Badge variant={issue.code === "ERROR" ? "soft-destructive" : "outline"}>
                        {KNOWN_ISSUE_CODES.has(issue.code) ? t(`issueCodes.${issue.code}`) : issue.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">{issue.studentName ?? "—"}</TableCell>
                    <TableCell className="align-top">{issue.admissionNo ?? "—"}</TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">{issue.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {run.issuesTotal > Math.min(run.issues.length, ISSUE_ROWS_SHOWN) && (
            <p className="text-xs text-muted-foreground">
              {t("issues.truncated", { shown: Math.min(run.issues.length, ISSUE_ROWS_SHOWN), total: run.issuesTotal })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AcademySyncCard({ status }: { status: AcademySyncStatusDto }) {
  const t = useTranslations("academySync");
  const start = useStartAcademySyncRun();
  const setAutoSync = useSetAcademyAutoSync();
  const [reviewed, setReviewed] = React.useState(false);

  const confirmed = status.firstImportConfirmedAt !== null;
  const running = status.runningRun !== null;
  const busy = running || start.isPending;
  const result = latestRun(status);
  const readyToImport = !confirmed && status.lastPreview !== null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Badge variant={!confirmed ? "outline" : status.autoSyncEnabled ? "soft-success" : "soft-primary"}>
          {!confirmed ? t("badge.notImported") : status.autoSyncEnabled ? t("badge.automatic") : t("badge.manual")}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {!confirmed && (
          <Alert>
            <AlertDescription>{t("intro")}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("linkedStudents")}</p>
            <p className="text-sm font-medium text-foreground">{status.mappedStudents}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("lastSuccess")}</p>
            <p className="text-sm font-medium text-foreground">{formatDateTime(status.lastSuccessAt)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("firstImport")}</p>
            <p className="text-sm font-medium text-foreground">
              {confirmed ? formatDateTime(status.firstImportConfirmedAt) : t("notYet")}
            </p>
          </div>
        </div>

        {running && (
          <Alert>
            <AlertDescription>{t("running")}</AlertDescription>
          </Alert>
        )}

        {result && <RunResult run={result} />}

        {readyToImport && (
          <div className="flex items-start gap-2">
            <Checkbox id="academy-sync-reviewed" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
            <Label htmlFor="academy-sync-reviewed" className="text-sm font-normal leading-snug">
              {t("reviewedLabel")}
            </Label>
          </div>
        )}

        {confirmed && (
          <div className="flex items-start gap-2">
            <Checkbox
              id="academy-sync-auto"
              checked={status.autoSyncEnabled}
              disabled={setAutoSync.isPending}
              onChange={(e) => setAutoSync.mutate(e.target.checked)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="academy-sync-auto" className="text-sm font-medium leading-snug">
                {t("autoSync.label")}
              </Label>
              <p className="text-xs text-muted-foreground">{t("autoSync.hint")}</p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {!confirmed ? (
          <>
            <Button variant={readyToImport ? "outline" : "default"} disabled={busy} onClick={() => start.mutate({ mode: "PREVIEW", scope: "FULL" })}>
              {start.isPending && start.variables?.mode === "PREVIEW" ? t("previewing") : readyToImport ? t("previewAgain") : t("preview")}
            </Button>
            {readyToImport && (
              <Button
                disabled={busy || !reviewed}
                onClick={() => start.mutate({ mode: "IMPORT", scope: "FULL", confirmFirstImport: true })}
              >
                {start.isPending && start.variables?.mode === "IMPORT" ? t("importing") : t("import")}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button disabled={busy} onClick={() => start.mutate({ mode: "IMPORT", scope: "INCREMENTAL" })}>
              {start.isPending && start.variables?.scope === "INCREMENTAL" ? t("syncing") : t("syncNow")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => start.mutate({ mode: "IMPORT", scope: "FULL" })}>
              {start.isPending && start.variables?.scope === "FULL" ? t("syncing") : t("fullSync")}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

/**
 * The Academy student sync, shown on the Licence page once the ERP is connected to its Academy school. Nothing is
 * created in the ERP until a preview has been reviewed and the first import confirmed; after that it is a "Sync now"
 * button plus an optional automatic mode. Everything the sync declined to do on its own (no admission number, a class
 * that differs, a student who left) is listed under "Needs your attention".
 */
export function AcademySyncSection({ connected }: { connected: boolean }) {
  const query = useAcademySyncStatus();
  if (!connected) return null;
  return <QueryBoundary query={query}>{(status) => <AcademySyncCard status={status} />}</QueryBoundary>;
}
