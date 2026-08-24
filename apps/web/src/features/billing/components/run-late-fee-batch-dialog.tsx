"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import type { RunLateFeeBatchDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useRunLateFeeBatch } from "../hooks/use-late-fee-batches";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Run Late Fees Now" — a deliberate, manual, human-triggered stand-in for a
 * future nightly job. No scheduler/worker exists anywhere in this codebase
 * (confirmed by reading `LateFeeBatchesService.runBatch()`'s own doc comment
 * directly — "no scheduler exists in this codebase to trigger it
 * automatically"), so this dialog's copy frames the action as an explicit
 * tool a human reaches for, never as automation.
 *
 * `policyId` is a required prop, not a picker inside this dialog — the
 * late-fee-batches list page (`app/(erp)/billing/late-fee-batches/page.tsx`)
 * is already policy-scoped (`GET /billing/late-fee-batches?policyId=`
 * requires one), so this trigger is only rendered once a policy is
 * selected there, mirroring `CreateBudgetDialog`'s own required
 * `fiscalYearId` prop shape.
 *
 * On success, navigates straight to the new batch's own detail page — the
 * response already carries the full `summary` breakdown (status already
 * resolved to `DRAFT`/`PENDING_APPROVAL`/`POSTED` server-side), so there's
 * nothing meaningful left to render inline here, matching
 * `CreateBudgetDialog`'s own "create then navigate" shape.
 */
export function RunLateFeeBatchDialog({ policyId }: { policyId: string }) {
  const t = useTranslations("billing.lateFeeBatches.runDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [runDate, setRunDate] = React.useState(() => todayIsoDate());
  const [error, setError] = React.useState<string | null>(null);
  const runMutation = useRunLateFeeBatch();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setRunDate(todayIsoDate());
      setError(null);
    }
  }

  async function handleRun() {
    if (!runDate) return;
    setError(null);
    const dto: RunLateFeeBatchDto = { policyId, runDate };
    try {
      const batch = await runMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/billing/late-fee-batches/${batch.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Play className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertDescription>{t("manualActionHint")}</AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("runDateLabel")}</Label>
          <Input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} required />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleRun()} disabled={!runDate || runMutation.isPending}>
            {runMutation.isPending ? t("running") : t("runButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
