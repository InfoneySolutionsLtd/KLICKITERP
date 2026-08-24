"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ConcessionResponseDto, InvoiceResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { usePostStandaloneConcession } from "../hooks/use-concessions";

/**
 * Part 4 (Billing sub-features batch) — `ConcessionsService.postStandalone()`
 * only accepts an `APPROVED` concession targeting an already-POSTED (or
 * PARTIALLY_PAID/PAID) invoice; a DRAFT target invoice instead auto-folds
 * the concession into its own upcoming P-01..P-04 post with no separate
 * standalone action possible or needed — that case is a plain informational
 * note at the invoice detail page's own section level (not per row here),
 * per the plan's explicit "not a disabled button pretending an action
 * exists" instruction. This component therefore renders NOTHING at all
 * outside its real gate (`concession.status === "APPROVED" &&
 * invoice.status !== "DRAFT"`), rather than a disabled/explained button.
 *
 * Rendered only on the invoice-scoped surface — `ConcessionsTable`'s
 * student-scoped usage on the student detail page never passes an `invoice`
 * prop, so this component never mounts there (see that table's own doc
 * comment), matching the plan's "no post-standalone button on this surface."
 *
 * Real, permanent side effect stated plainly in the confirm dialog: this
 * posts a real GL journal AND increments the target invoice's own
 * `paidAmount` (see `ConcessionsService.postStandalone()`'s own doc comment
 * for why `paidAmount` is the honest-but-overloaded lever it uses) — which
 * permanently blocks `VoidInvoiceButton`'s own BR-BILL-09 gate on this
 * invoice from this point forward, the documented answer to that button's
 * own "Use a credit note instead" hint (concessions are the other real
 * answer, alongside Credit Notes).
 */
export function PostStandaloneConcessionButton({
  concession,
  invoice,
}: {
  concession: ConcessionResponseDto;
  invoice: InvoiceResponseDto;
}) {
  const t = useTranslations("billing.concessions.statusActions");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const postMutation = usePostStandaloneConcession(concession.studentId, invoice.id);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await postMutation.mutateAsync(concession.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (concession.status !== "APPROVED" || invoice.status === "DRAFT") return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          {t("postStandaloneTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("postStandaloneConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("postStandaloneConfirmDescription", { number: invoice.number })}</DialogDescription>
        </DialogHeader>

        <Alert variant="warning">
          <AlertDescription>{t("postStandaloneBlocksVoidNote")}</AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={postMutation.isPending}>
            {postMutation.isPending ? t("postingStandalone") : t("postStandaloneConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
