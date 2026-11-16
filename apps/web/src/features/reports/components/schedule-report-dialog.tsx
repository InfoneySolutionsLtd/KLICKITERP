"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useCreateSchedule } from "../hooks/use-schedules";
import { CronScheduleInput, DEFAULT_CRON, isValidCronShape } from "./cron-schedule-input";

/** Splits on commas/newlines, trims, dedupes, drops anything without an "@" — a UX nicety only; the backend already soft-filters non-email entries at delivery time rather than rejecting them. */
function parseRecipients(raw: string): string[] {
  const emails = raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  return Array.from(new Set(emails));
}

type ScheduleFormat = "PDF" | "CSV";

/**
 * Format is a choice between PDF (the default — branded, with a verification
 * QR code) and CSV (raw data). XLSX is deliberately NOT offered: it is still a
 * queued-forever placeholder server-side (no worker exists to ever process
 * it), so offering it would silently promise a report that never arrives.
 */
export function ScheduleReportDialog({
  reportCode,
  params,
  disabled,
}: {
  reportCode: string;
  params: Record<string, unknown>;
  disabled?: boolean;
}) {
  const t = useTranslations("reports.detail.scheduleDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [cron, setCron] = React.useState(DEFAULT_CRON);
  const [recipientsText, setRecipientsText] = React.useState("");
  const [format, setFormat] = React.useState<ScheduleFormat>("PDF");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateSchedule();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCron(DEFAULT_CRON);
      setRecipientsText("");
      setFormat("PDF");
      setError(null);
    }
  }

  const recipients = parseRecipients(recipientsText);
  const canSubmit = isValidCronShape(cron) && recipients.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ reportCode, params, cron, recipients, format });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <CalendarClock className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("cronLabel")}</Label>
            <CronScheduleInput value={cron} onChange={setCron} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("recipientsLabel")}</Label>
            <Textarea
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
              placeholder={t("recipientsPlaceholder")}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t("recipientsHint", { count: recipients.length })}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("formatLabel")}</Label>
            <Select value={format} onValueChange={(value) => setFormat(value as ScheduleFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PDF">{t("formatPdf")}</SelectItem>
                <SelectItem value="CSV">{t("formatCsv")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("formatHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
