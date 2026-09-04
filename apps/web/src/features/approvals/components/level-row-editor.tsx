"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRoles } from "@/features/roles/hooks/use-roles";
import { useUsersLookup } from "../hooks/use-users-lookup";
import { emptyLevelRow, isLevelRowComplete, updateLevelRow, type LevelFormRow } from "../lib/workflow-version-lines";

/**
 * The repeatable level-row editor for the "Publish New Version" page.
 * Mirrors `features/accounting/components/journal-line-editor.tsx`'s exact
 * table-row-array shape. Row order IS the level's `seq` (1-based, top to
 * bottom) — no manual seq input, per `workflow-version-lines.ts`'s own doc
 * comment.
 *
 * `slaHours`/`escalation` are deliberately NOT surfaced here at all — both
 * are stored server-side but never acted on (no scheduler exists to read
 * either), so exposing them would suggest a working feature that doesn't
 * exist.
 */
export function LevelRowEditor({ rows, onChange }: { rows: LevelFormRow[]; onChange: (rows: LevelFormRow[]) => void }) {
  const t = useTranslations("approvals.workflows.levelEditor");
  const rolesQuery = useRoles();
  const usersQuery = useUsersLookup();

  const roleItems = React.useMemo(
    () => (rolesQuery.data ?? []).map((r) => ({ value: r.id, label: r.name })),
    [rolesQuery.data],
  );
  const userOptions = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName })),
    [usersQuery.data],
  );

  function patchRow(key: string, patch: Partial<LevelFormRow>) {
    onChange(updateLevelRow(rows, key, patch));
  }

  function addRow() {
    onChange([...rows, emptyLevelRow()]);
  }

  function removeRow(key: string) {
    onChange(rows.filter((r) => r.key !== key));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">{t("seq")}</TableHead>
              <TableHead>{t("approverType")}</TableHead>
              <TableHead>{t("approver")}</TableHead>
              <TableHead>{t("mode")}</TableHead>
              <TableHead className="w-28">{t("quorum")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.key}>
                <TableCell className="text-sm text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="min-w-[160px]">
                  <Select
                    value={row.approverType}
                    onValueChange={(v) => patchRow(row.key, { approverType: v as LevelFormRow["approverType"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ROLE">{t("approverTypeRole")}</SelectItem>
                      <SelectItem value="USERS">{t("approverTypeUsers")}</SelectItem>
                      <SelectItem value="DEPT_HEAD">{t("approverTypeDeptHead")}</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="min-w-[220px]">
                  {row.approverType === "ROLE" && (
                    <Combobox
                      items={roleItems}
                      value={row.roleId}
                      onChange={(v) => patchRow(row.key, { roleId: v })}
                      placeholder={rolesQuery.isLoading ? t("loadingRoles") : t("selectRole")}
                      searchPlaceholder={t("searchRoles")}
                      emptyText={t("noRolesFound")}
                      disabled={rolesQuery.isLoading}
                    />
                  )}
                  {row.approverType === "USERS" && (
                    <MultiSelect
                      options={userOptions}
                      selected={row.userIds}
                      onChange={(v) => patchRow(row.key, { userIds: v })}
                      placeholder={usersQuery.isLoading ? t("loadingUsers") : t("selectUsers")}
                      disabled={usersQuery.isLoading}
                    />
                  )}
                  {row.approverType === "DEPT_HEAD" && (
                    <span className="text-sm text-muted-foreground">{t("deptHeadHint")}</span>
                  )}
                </TableCell>
                <TableCell className="min-w-[140px]">
                  <Select value={row.mode} onValueChange={(v) => patchRow(row.key, { mode: v as LevelFormRow["mode"] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEQUENTIAL">{t("modeSequential")}</SelectItem>
                      <SelectItem value="PARALLEL">{t("modeParallel")}</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    value={row.quorum}
                    disabled={row.mode !== "PARALLEL"}
                    onChange={(e) => patchRow(row.key, { quorum: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)} disabled={rows.length <= 1} aria-label={t("removeLevel")}>
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
        {t("addLevel")}
      </Button>

      {rows.some((row) => !isLevelRowComplete(row)) && (
        <p className="text-xs text-warning">{t("incompleteRowsWarning")}</p>
      )}
    </div>
  );
}
