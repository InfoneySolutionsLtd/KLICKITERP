"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { MultiSelect } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { emptyRuleRow, isRuleRowComplete, updateRuleRow, type RoutingRuleFormRow } from "../lib/workflow-version-lines";

/**
 * The repeatable routing-rule-row editor for the "Publish New Version" page.
 * `levelCount` (the sibling `<LevelRowEditor>`'s current row count) drives
 * the `levelSubset` picker's own option set — a rule can only select levels
 * that exist in the SAME version being published, matching
 * `RoutingRuleInputDto.levelSubset`'s real semantics (`appr_level.seq`
 * values within this version). Options are labeled "Level N" rather than a
 * role/approver summary, since a level's approver can change independently
 * and this label should stay stable while composing the form.
 */
export function RoutingRuleRowEditor({
  rows,
  onChange,
  levelCount,
}: {
  rows: RoutingRuleFormRow[];
  onChange: (rows: RoutingRuleFormRow[]) => void;
  levelCount: number;
}) {
  const t = useTranslations("approvals.workflows.routingRuleEditor");
  const departmentsQuery = useDepartments();

  const departmentItems = React.useMemo(
    () => (departmentsQuery.data ?? []).map((d) => ({ value: d.id, label: d.name })),
    [departmentsQuery.data],
  );
  const levelOptions = React.useMemo(
    () => Array.from({ length: levelCount }, (_, i) => ({ value: String(i + 1), label: t("levelOption", { seq: i + 1 }) })),
    [levelCount, t],
  );

  function patchRow(key: string, patch: Partial<RoutingRuleFormRow>) {
    onChange(updateRuleRow(rows, key, patch));
  }

  function addRow() {
    onChange([...rows, emptyRuleRow()]);
  }

  function removeRow(key: string) {
    onChange(rows.filter((r) => r.key !== key));
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("noRulesHint")}</p>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" />
          {t("addRule")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("minAmount")}</TableHead>
              <TableHead>{t("maxAmount")}</TableHead>
              <TableHead>{t("levelSubset")}</TableHead>
              <TableHead>{t("department")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="min-w-[140px]">
                  <MoneyInput value={row.minAmount} onValueChange={(v) => patchRow(row.key, { minAmount: v ?? "" })} currency={DEFAULT_CURRENCY} />
                </TableCell>
                <TableCell className="min-w-[140px]">
                  <MoneyInput
                    value={row.maxAmount}
                    onValueChange={(v) => patchRow(row.key, { maxAmount: v ?? "" })}
                    currency={DEFAULT_CURRENCY}
                    placeholder={t("noUpperBound")}
                  />
                </TableCell>
                <TableCell className="min-w-[180px]">
                  <MultiSelect
                    options={levelOptions}
                    selected={row.levelSubset.map(String)}
                    onChange={(v) => patchRow(row.key, { levelSubset: v.map(Number) })}
                    placeholder={t("allLevels")}
                  />
                </TableCell>
                <TableCell className="min-w-[200px]">
                  <Combobox
                    items={departmentItems}
                    value={row.departmentId}
                    onChange={(v) => patchRow(row.key, { departmentId: v })}
                    placeholder={departmentsQuery.isLoading ? t("loadingDepartments") : t("anyDepartment")}
                    searchPlaceholder={t("searchDepartments")}
                    emptyText={t("noDepartmentsFound")}
                    disabled={departmentsQuery.isLoading}
                  />
                </TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} aria-label={t("removeRule")}>
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="size-4" />
        {t("addRule")}
      </Button>

      {rows.some((row) => !isRuleRowComplete(row)) && <p className="text-xs text-warning">{t("incompleteRowsWarning")}</p>}
    </div>
  );
}
