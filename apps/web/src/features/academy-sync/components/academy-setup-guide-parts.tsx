"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, CircleDashed, Lock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useUsers } from "@/features/users/hooks/use-users";
import type { AcademySetupGuideDto } from "../api/academy-setup-guide.api";
import { useSetPaymentsCashier } from "../hooks/use-academy-setup-guide";
import { scrollToSection, stepActions, targetToDoFirst, type StepAction, type StepKey, type StepTarget } from "../setup-guide-targets";

export type GuideStep = AcademySetupGuideDto["steps"][number];

/** The guide's steps with their `key` narrowed to the known keys (the generated type is a plain string). */
export function typedSteps(guide: AcademySetupGuideDto) {
  return guide.steps.map((step) => ({ ...step, key: step.key as StepKey, blockedBy: step.blockedBy as string[], state: step.state as string }));
}

export type TypedStep = ReturnType<typeof typedSteps>[number];

/**
 * Runs a target: scroll to a card on this page, open another page, or follow a "do this first" chain to where it is done. A
 * `picker` target is handled by the caller (it is a piece of the row itself), so it is reported back instead.
 */
export function useStepRunner(guide: AcademySetupGuideDto) {
  const router = useRouter();
  return React.useCallback(
    (target: StepTarget): "picker" | null => {
      const steps = typedSteps(guide);
      const resolved = "step" in target ? targetToDoFirst(target.step, steps, guide.payments) : target;
      if (!resolved || "step" in resolved) return null;
      if ("picker" in resolved) return "picker";
      if ("anchor" in resolved) {
        scrollToSection(resolved.anchor);
        return null;
      }
      router.push(resolved.href);
      return null;
    },
    [guide, router],
  );
}

const STATE_ICON = {
  DONE: <CheckCircle2 className="size-5 text-success" aria-hidden />,
  TODO: <CircleDashed className="size-5 text-muted-foreground" aria-hidden />,
  ATTENTION: <TriangleAlert className="size-5 text-warning" aria-hidden />,
  LOCKED: <Lock className="size-5 text-muted-foreground" aria-hidden />,
} as const;

export function StepStateIcon({ state }: { state: string }) {
  return STATE_ICON[state as keyof typeof STATE_ICON] ?? STATE_ICON.TODO;
}

// Quiet colours on purpose: the icon already says the state, so Locked is muted (not the theme's bright secondary) and Needs
// attention is an outlined warning, readable on both the light and the dark theme.
const STATE_BADGE = {
  DONE: { variant: "soft-success", className: "" },
  TODO: { variant: "outline", className: "" },
  ATTENTION: { variant: "outline", className: "border-warning text-warning" },
  LOCKED: { variant: "outline", className: "text-muted-foreground" },
} as const;

export function StepStateBadge({ state }: { state: string }) {
  const t = useTranslations("license.setupGuide.state");
  const style = STATE_BADGE[state as keyof typeof STATE_BADGE] ?? STATE_BADGE.TODO;
  return (
    <Badge variant={style.variant} className={style.className}>
      {t(state as "DONE")}
    </Badge>
  );
}

/** One sentence about where this step stands: done, waiting on something, or why it needs doing. */
export function StepExplanation({ step }: { step: TypedStep }) {
  const t = useTranslations("license.setupGuide");
  if (step.state === "DONE") return <>{t(`steps.${step.key}.done`)}</>;
  if (step.state === "LOCKED") {
    const names = step.blockedBy.map((key) => `“${t(`steps.${key as StepKey}.title`)}”`).join(", ");
    return <>{t("locked.needs", { steps: names })}</>;
  }
  const detailKey = step.detail ? (`steps.${step.key}.detail.${step.detail}` as const) : null;
  // A detail code the web app has no words for yet falls back to the step's general explanation.
  const text = detailKey && t.has(detailKey) ? t(detailKey) : t(`steps.${step.key}.why`);
  return <>{text}</>;
}

/** The buttons a step's row offers; a picker action toggles the built-in cashier picker through `onPicker`. */
export function StepActions({
  step,
  guide,
  onPicker,
  pickerOpen,
  onNavigate,
}: {
  step: TypedStep;
  guide: AcademySetupGuideDto;
  onPicker?: () => void;
  pickerOpen?: boolean;
  /** Called after a button took the person somewhere (a card on the page or another page), e.g. to close a dialog. */
  onNavigate?: () => void;
}) {
  const t = useTranslations("license.setupGuide.actions");
  const tSteps = useTranslations("license.setupGuide.steps");
  const run = useStepRunner(guide);
  const actions: StepAction[] = stepActions(step, guide.payments);
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const label = action.labelKey === "doFirst" ? t("doFirst", { step: tSteps(`${action.firstStep as StepKey}.title`) }) : t(action.labelKey);
        const primary = !step.optional && step.state !== "LOCKED";
        return (
          <Button
            key={`${action.labelKey}-${"href" in action.target ? action.target.href : ""}`}
            type="button"
            size="sm"
            variant={action.labelKey === "doFirst" ? "outline" : primary ? "default" : "outline"}
            aria-expanded={"picker" in action.target ? pickerOpen : undefined}
            onClick={() => {
              if (run(action.target) === "picker") onPicker?.();
              else onNavigate?.();
            }}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

/** Chooses the user the receipts of parent M-Pesa payments are recorded under (the M-Pesa system cashier). */
export function PaymentsCashierPicker({ cashier }: { cashier: AcademySetupGuideDto["payments"]["cashier"] }) {
  const t = useTranslations("license.setupGuide.cashier");
  const save = useSetPaymentsCashier();
  const [userId, setUserId] = React.useState("");
  const usersQuery = useUsers({ status: "ACTIVE", pageSize: 200 });
  const items = React.useMemo(() => (usersQuery.data?.items ?? []).map((user) => ({ value: user.id, label: user.fullName })), [usersQuery.data]);

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium text-foreground">{t("title")}</p>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      {cashier.userId && !cashier.userActive && <p className="text-xs text-warning-foreground">{t("inactive", { name: cashier.userName ?? t("unknownUser") })}</p>}
      {usersQuery.isError ? (
        <p className="text-xs text-muted-foreground">{t("cannotLoadUsers")}</p>
      ) : (
        <Combobox
          items={items}
          value={userId}
          onChange={setUserId}
          placeholder={usersQuery.isLoading ? t("loadingUsers") : t("pickPlaceholder")}
          searchPlaceholder={t("searchUsers")}
          emptyText={t("noUsers")}
          disabled={usersQuery.isLoading || save.isPending}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void save.mutateAsync(userId).then(() => setUserId(""))} disabled={!userId || save.isPending}>
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <Link href="/users" className="text-xs text-primary hover:underline">
          {t("manageUsers")}
        </Link>
      </div>
    </div>
  );
}
