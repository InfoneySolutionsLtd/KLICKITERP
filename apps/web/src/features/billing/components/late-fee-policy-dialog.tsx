"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { LateFeePolicyResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useCreateLateFeePolicy, useUpdateLateFeePolicy } from "../hooks/use-late-fee-policies";
import { LateFeePolicyParamsForm, type LateFeePolicyMode } from "./late-fee-policy-params-form";

const MODES: LateFeePolicyMode[] = ["FLAT", "PERCENT", "TIERED"];

/**
 * Create/edit `bill_late_fee_policy` dialog — the same plain-controlled-input
 * `Dialog`/`useState` shape `fee-category-dialog.tsx` established for small
 * forms in this codebase, not `react-hook-form`. `name` is rendered ONLY in
 * create mode: `UpdateLateFeePolicyDto` has no `name` field at all (confirmed
 * by reading `late-fee-policy.dto.ts`) — a policy's name can never be renamed
 * after creation, matching this codebase's "immutable-after-creation fields
 * get omitted, not disabled" convention (same treatment `class-dialog.tsx`
 * gives its own immutable fields).
 *
 * Changing `mode` resets `params` to an empty object — the field names a
 * FLAT/PERCENT/TIERED `params` object needs are mutually exclusive
 * (`amount` vs `rate` vs `tiers`), so carrying over the previous mode's
 * values would silently ship stale, meaningless keys alongside the new
 * mode's real ones.
 */
export function LateFeePolicyDialog({
  mode: dialogMode,
  policy,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  policy?: LateFeePolicyResponseDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("billing.lateFeePolicies.dialog");
  const tModes = useTranslations("billing.lateFeePolicies.modeValues");
  const tCommon = useTranslations("common");

  const [name, setName] = React.useState("");
  const [policyMode, setPolicyMode] = React.useState<LateFeePolicyMode>("FLAT");
  const [params, setParams] = React.useState<Record<string, unknown>>({});
  const [graceDays, setGraceDays] = React.useState("0");
  const [requiresApproval, setRequiresApproval] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateLateFeePolicy();
  const updateMutation = useUpdateLateFeePolicy(policy?.id ?? "");
  const pending = createMutation.isPending || updateMutation.isPending;

  React.useEffect(() => {
    if (open) {
      setName(policy?.name ?? "");
      setPolicyMode((policy?.mode as LateFeePolicyMode | undefined) ?? "FLAT");
      setParams(policy?.params ?? {});
      setGraceDays(policy ? String(policy.graceDays) : "0");
      setRequiresApproval(policy?.requiresApproval ?? false);
      setError(null);
    }
  }, [open, policy]);

  function handleModeChange(next: LateFeePolicyMode) {
    setPolicyMode(next);
    setParams({});
  }

  function validateParams(): string | null {
    if (policyMode === "FLAT") {
      if (typeof params.amount !== "string" || params.amount.trim() === "") return t("amountRequired");
    } else if (policyMode === "PERCENT") {
      if (typeof params.rate !== "string" || params.rate.trim() === "") return t("rateRequired");
    } else {
      const tiers = Array.isArray(params.tiers) ? params.tiers : [];
      if (tiers.length === 0) return t("tiersRequired");
      for (const tier of tiers as Record<string, unknown>[]) {
        const hasAmount = typeof tier.amount === "string" && tier.amount.trim() !== "";
        const hasRate = typeof tier.rate === "string" && tier.rate.trim() !== "";
        if (!hasAmount && !hasRate) return t("tierAmountOrRateRequired");
      }
    }
    return null;
  }

  async function handleSubmit() {
    setError(null);
    const parsedGraceDays = Number(graceDays);
    if (dialogMode === "create" && !name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!Number.isFinite(parsedGraceDays) || parsedGraceDays < 0) {
      setError(t("graceDaysInvalid"));
      return;
    }
    const paramsError = validateParams();
    if (paramsError) {
      setError(paramsError);
      return;
    }
    try {
      if (dialogMode === "create") {
        await createMutation.mutateAsync({
          name,
          mode: policyMode,
          params,
          graceDays: parsedGraceDays,
          requiresApproval,
        });
      } else {
        await updateMutation.mutateAsync({
          mode: policyMode,
          params,
          graceDays: parsedGraceDays,
          requiresApproval,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogMode === "create" ? t("titleCreate") : t("titleEdit")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {dialogMode === "create" && (
            <div className="space-y-1.5">
              <Label required>{t("name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </div>
          )}

          <div className="space-y-1.5">
            <Label required>{t("mode")}</Label>
            <Select value={policyMode} onValueChange={(v) => handleModeChange(v as LateFeePolicyMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tModes(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <LateFeePolicyParamsForm mode={policyMode} value={params} onChange={setParams} />

          <div className="space-y-1.5">
            <Label>{t("graceDays")}</Label>
            <Input type="number" min={0} value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("graceDaysHint")}</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="size-4 rounded border-input"
            />
            {t("requiresApproval")}
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
