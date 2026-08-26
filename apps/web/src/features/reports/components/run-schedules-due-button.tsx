"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PlayCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useRunSchedulesDue } from "../hooks/use-schedules";
import type { RunDueResult } from "../api/schedules.api";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * **The single most important piece of UI in this part** — no cron/worker
 * process anywhere in this codebase ever calls `POST /reports/schedules/run-due`
 * automatically (confirmed by reading `ReportSchedulesService` directly).
 * This button is the ONLY thing that ever fires a schedule. Modeled directly
 * on `features/expenses/components/run-due-button.tsx`'s own two-step
 * dialog: pick `asOfDate` (defaults to today) → confirm → a real
 * `RunDueResult[]` shown, an honest "nothing was due" state when empty.
 *
 * Genuinely sends real email (`ReportSchedulesService.attemptDelivery()` →
 * `platform/comms`'s real `NotificationsService`) to each due, active
 * schedule's recipients — not a simulation.
 */
export function RunSchedulesDueButton() {
  const t = useTranslations("reports.schedules.runDue");
  const tCommon = useTranslations("common");

  const [open, setOpen] = React.useState(false);
  const [asOfDate, setAsOfDate] = React.useState(todayIso());
  const [results, setResults] = React.useState<RunDueResult[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const runDueMutation = useRunSchedulesDue();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAsOfDate(todayIso());
      setResults(null);
      setError(null);
    }
  }

  async function handleRun() {
    setError(null);
    try {
      const fired = await runDueMutation.mutateAsync(asOfDate);
      setResults(fired);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="lg">
          <PlayCircle className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {results === null && (
          <div className="space-y-1.5">
            <Label>{t("asOfDateLabel")}</Label>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("asOfDateHint")}</p>
          </div>
        )}

        {results !== null && (
          <div className="space-y-3">
            {results.length === 0 ? (
              <Alert>
                <AlertDescription>{t("noneWereDue", { date: asOfDate })}</AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">{t("resultSummary", { count: results.length })}</p>
                <ul className="space-y-2">
                  {results.map((r) => (
                    <li key={r.scheduleId} className="flex flex-col gap-0.5 rounded-md border border-border p-2 text-sm">
                      <Link href={`/reports/${r.reportCode}`} className="font-medium text-primary hover:underline">
                        {r.reportCode}
                      </Link>
                      <span className={r.ok ? "text-xs text-success" : "text-xs text-destructive"}>
                        {r.ok ? t("resultOk") : t("resultFailed")}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {results === null ? (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" onClick={() => void handleRun()} disabled={runDueMutation.isPending || !asOfDate}>
                {runDueMutation.isPending ? t("running") : t("runButton")}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => setOpen(false)}>
              {tCommon("close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
