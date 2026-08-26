"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { scheduleRecipients, type ScheduleResponseDto } from "../api/schedules.api";
import { useUpdateSchedule } from "../hooks/use-schedules";
import { CronScheduleInput, isValidCronShape } from "./cron-schedule-input";

function parseRecipients(raw: string): string[] {
  const emails = raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  return Array.from(new Set(emails));
}

/** Cron/recipients/active-toggle only — `format` stays fixed at `"CSV"`, never exposed for editing (see `ScheduleReportDialog`'s own doc comment for why). */
export function EditScheduleDialog({ schedule }: { schedule: ScheduleResponseDto }) {
  const t = useTranslations("reports.schedules.editDialog");
  const tCommon = useTranslations("common");
  const originalRecipients = React.useMemo(() => scheduleRecipients(schedule), [schedule]);

  const [open, setOpen] = React.useState(false);
  const [cron, setCron] = React.useState(schedule.cron);
  const [recipientsText, setRecipientsText] = React.useState(originalRecipients.join("\n"));
  const [isActive, setIsActive] = React.useState(schedule.isActive);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateSchedule();

  function resetForm() {
    setCron(schedule.cron);
    setRecipientsText(originalRecipients.join("\n"));
    setIsActive(schedule.isActive);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const recipients = parseRecipients(recipientsText);
  const canSubmit = isValidCronShape(cron) && recipients.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: { cron?: string; recipients?: string[]; isActive?: boolean } = {};
    if (cron !== schedule.cron) dto.cron = cron;
    if (JSON.stringify(recipients) !== JSON.stringify(originalRecipients)) dto.recipients = recipients;
    if (isActive !== schedule.isActive) dto.isActive = isActive;
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: schedule.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {tCommon("edit")}
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
            <Textarea value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} rows={3} />
            <p className="text-xs text-muted-foreground">{t("recipientsHint", { count: recipients.length })}</p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="edit-report-schedule-is-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <div>
              <Label htmlFor="edit-report-schedule-is-active">{t("isActiveLabel")}</Label>
              <p className="text-xs text-muted-foreground">{t("isActiveHint")}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
