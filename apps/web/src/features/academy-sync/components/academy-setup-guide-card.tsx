"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronDown, ChevronUp, Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademySetupGuideDto } from "../api/academy-setup-guide.api";
import { useAcademySetupGuide } from "../hooks/use-academy-setup-guide";
import { primaryTarget, type StepKey } from "../setup-guide-targets";
import {
  PaymentsCashierPicker,
  StepActions,
  StepExplanation,
  StepStateBadge,
  StepStateIcon,
  typedSteps,
  useStepRunner,
  type TypedStep,
} from "./academy-setup-guide-parts";
import { AcademySetupGuideWizard } from "./academy-setup-guide-wizard";

const GROUP_ORDER = ["SHOW_INVOICES", "RECEIPTS_AND_PAYMENTS", "PARENT_INVOICES"] as const;

function StepRow({ step, guide }: { step: TypedStep; guide: AcademySetupGuideDto }) {
  const t = useTranslations("license.setupGuide");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const isPayments = step.key === "PAYMENTS";
  const showPicker = isPayments && step.state !== "LOCKED" && step.state !== "DONE" && !guide.payments.cashier.configured && pickerOpen;

  return (
    <li id={`setup-step-${step.key}`} className="flex gap-3 py-3">
      <div className="pt-0.5">
        <StepStateIcon state={step.state} />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className={step.state === "LOCKED" ? "text-sm font-medium text-muted-foreground" : "text-sm font-medium text-foreground"}>{t(`steps.${step.key}.title`)}</p>
          <StepStateBadge state={step.state} />
          {step.optional && <Badge variant="outline">{t("optional")}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          <StepExplanation step={step} />
        </p>
        <StepActions step={step} guide={guide} onPicker={() => setPickerOpen((open) => !open)} pickerOpen={pickerOpen} />
        {showPicker && <PaymentsCashierPicker cashier={guide.payments.cashier} />}
      </div>
    </li>
  );
}

function AcademySetupGuideCard({ guide }: { guide: AcademySetupGuideDto }) {
  const t = useTranslations("license.setupGuide");
  const allDone = guide.doneCount === guide.totalCount;
  const [open, setOpen] = React.useState(!allDone);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const run = useStepRunner(guide);
  const steps = typedSteps(guide);
  const next = steps.find((step) => step.key === guide.nextStepKey);
  const percent = Math.round((guide.doneCount / Math.max(guide.totalCount, 1)) * 100);

  // Everything done: collapse to a single line; coming back to an unfinished state opens it again.
  React.useEffect(() => {
    if (allDone) setOpen(false);
  }, [allDone]);

  function goToNext() {
    if (!next) return;
    const target = primaryTarget(next, guide.payments);
    if (!target) return;
    if (run(target) === "picker") document.getElementById(`setup-step-${next.key as StepKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <Card id="setup-guide">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            {allDone ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <Compass className="size-5 text-primary" aria-hidden />}
            {t("title")}
          </CardTitle>
          <CardDescription>{allDone ? t("allDone") : t("subtitle")}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!allDone && next && (
            <Button type="button" size="sm" onClick={goToNext}>
              {t("nextStep", { step: t(`steps.${next.key}.title`) })}
            </Button>
          )}
          {!allDone && (
            <Button type="button" size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
              {t("guideMe")}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="setup-guide-steps">
            {open ? <ChevronUp className="mr-1 size-4" aria-hidden /> : <ChevronDown className="mr-1 size-4" aria-hidden />}
            {open ? t("hideSteps") : t("showSteps")}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t("progress", { done: guide.doneCount, total: guide.totalCount })}</p>
            <p className="text-xs text-muted-foreground">{t("required", { done: guide.requiredDone, total: guide.requiredTotal })}</p>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={guide.totalCount}
            aria-valuenow={guide.doneCount}
            aria-label={t("progress", { done: guide.doneCount, total: guide.totalCount })}
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {open && (
          <div id="setup-guide-steps" className="space-y-4">
            {GROUP_ORDER.map((group) => {
              const inGroup = steps.filter((step) => step.group === group);
              if (inGroup.length === 0) return null;
              return (
                <section key={group} aria-label={t(`group.${group}`)}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`group.${group}`)}</h3>
                  <ul className="divide-y">
                    {inGroup.map((step) => (
                      <StepRow key={step.key} step={step} guide={guide} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>

      <AcademySetupGuideWizard guide={guide} open={wizardOpen} onOpenChange={setWizardOpen} />
    </Card>
  );
}

/**
 * The guided configuration of the Klickit Academy link, at the top of the Licence page: what is done, what is next, and a button
 * on every step that leads to where it is set up (a card on this page, or another page such as Branding or Integrations). It is
 * worked out by the server from the real state, so it always agrees with the cards below it. Hidden for someone who may not see it.
 */
export function AcademySetupGuideSection() {
  const query = useAcademySetupGuide();
  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (query.isError || !query.data) return null;
  return <AcademySetupGuideCard guide={query.data} />;
}
