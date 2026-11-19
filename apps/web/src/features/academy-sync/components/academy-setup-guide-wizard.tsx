"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AcademySetupGuideDto } from "../api/academy-setup-guide.api";
import { PaymentsCashierPicker, StepActions, StepExplanation, StepStateBadge, typedSteps } from "./academy-setup-guide-parts";

interface WizardProps {
  guide: AcademySetupGuideDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Guide me": walks through the steps that are not done yet, one at a time and in order, with Back / Next. Each step says why it
 * matters and what is missing, and has the same button as in the checklist (which closes the walkthrough and takes the person
 * there). Reopening starts at the next step to do. The steps are read from the live guide, so one completed in the meantime drops out.
 */
export function AcademySetupGuideWizard({ guide, open, onOpenChange }: WizardProps) {
  const t = useTranslations("license.setupGuide");
  const remaining = React.useMemo(() => typedSteps(guide).filter((step) => step.state !== "DONE"), [guide]);
  const [index, setIndex] = React.useState(0);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // Each time it opens, start at the step the guide recommends (the first one that can be started).
  React.useEffect(() => {
    if (!open) return;
    const start = remaining.findIndex((step) => step.key === guide.nextStepKey);
    setIndex(start >= 0 ? start : 0);
    setPickerOpen(false);
    // Only when it is opened: later refreshes of the guide must not move the person to another step under their hands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const current = remaining[Math.min(index, Math.max(remaining.length - 1, 0))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("wizard.title")}</DialogTitle>
          <DialogDescription>{current ? t("wizard.stepOf", { n: Math.min(index, remaining.length - 1) + 1, total: remaining.length }) : t("wizard.nothingLeft")}</DialogDescription>
        </DialogHeader>

        {current ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{t(`steps.${current.key}.title`)}</h3>
              <StepStateBadge state={current.state} />
            </div>
            <p className="text-sm text-muted-foreground">{t(`steps.${current.key}.why`)}</p>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-foreground">
              <StepExplanation step={current} />
            </div>
            <StepActions
              step={current}
              guide={guide}
              pickerOpen={pickerOpen}
              onPicker={() => setPickerOpen((value) => !value)}
              onNavigate={() => onOpenChange(false)}
            />
            {current.key === "PAYMENTS" && pickerOpen && !guide.payments.cashier.configured && <PaymentsCashierPicker cashier={guide.payments.cashier} />}
          </div>
        ) : (
          <p className="text-sm text-foreground">{t("wizard.allDone")}</p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setPickerOpen(false); setIndex((value) => Math.max(0, value - 1)); }} disabled={!current || index <= 0}>
              {t("wizard.back")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setPickerOpen(false); setIndex((value) => Math.min(remaining.length - 1, value + 1)); }}
              disabled={!current || index >= remaining.length - 1}
            >
              {t("wizard.next")}
            </Button>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("wizard.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
