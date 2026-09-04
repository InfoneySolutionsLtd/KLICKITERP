"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { RoutingRuleResponseDto, UpdateRoutingRuleDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useUpdateRoutingRule } from "../hooks/use-workflow-versions";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Fix-a-typo edit for a single, already-existing routing-rule row — same "no add/remove, PATCH only" constraint as `<EditLevelDialog>`. `levelCount` (the version's own current level count) bounds the `levelSubset` picker's options. */
export function EditRoutingRuleDialog({ rule, versionId, levelCount }: { rule: RoutingRuleResponseDto; versionId: string; levelCount: number }) {
  const t = useTranslations("approvals.workflows.routingRuleEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [minAmount, setMinAmount] = React.useState(rule.minAmount);
  const [maxAmount, setMaxAmount] = React.useState(rule.maxAmount ?? "");
  const [levelSubset, setLevelSubset] = React.useState<number[]>(rule.levelSubset ?? []);
  const [departmentId, setDepartmentId] = React.useState(rule.departmentId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const departmentsQuery = useDepartments();
  const updateMutation = useUpdateRoutingRule(versionId);

  const departmentItems = React.useMemo(() => (departmentsQuery.data ?? []).map((d) => ({ value: d.id, label: d.name })), [departmentsQuery.data]);
  const levelOptions = React.useMemo(
    () => Array.from({ length: levelCount }, (_, i) => ({ value: String(i + 1), label: t("levelOption", { seq: i + 1 }) })),
    [levelCount, t],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setMinAmount(rule.minAmount);
      setMaxAmount(rule.maxAmount ?? "");
      setLevelSubset(rule.levelSubset ?? []);
      setDepartmentId(rule.departmentId ?? "");
      setError(null);
    }
  }

  const canSubmit = DECIMAL_PATTERN.test(minAmount.trim());

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateRoutingRuleDto = {
      minAmount: minAmount.trim(),
      maxAmount: maxAmount.trim() ? maxAmount.trim() : null,
      levelSubset: levelSubset.length > 0 ? levelSubset : null,
      departmentId: departmentId || null,
    };
    try {
      await updateMutation.mutateAsync({ ruleId: rule.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={tCommon("edit")}>
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("minAmount")}</Label>
            <MoneyInput value={minAmount} onValueChange={(v) => setMinAmount(v ?? "")} currency={DEFAULT_CURRENCY} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("maxAmount")}</Label>
            <MoneyInput value={maxAmount} onValueChange={(v) => setMaxAmount(v ?? "")} currency={DEFAULT_CURRENCY} placeholder={t("noUpperBound")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("levelSubset")}</Label>
            <MultiSelect
              options={levelOptions}
              selected={levelSubset.map(String)}
              onChange={(v) => setLevelSubset(v.map(Number))}
              placeholder={t("allLevels")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("department")}</Label>
            <Combobox
              items={departmentItems}
              value={departmentId}
              onChange={setDepartmentId}
              placeholder={departmentsQuery.isLoading ? t("loadingDepartments") : t("anyDepartment")}
              searchPlaceholder={t("searchDepartments")}
              emptyText={t("noDepartmentsFound")}
            />
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
