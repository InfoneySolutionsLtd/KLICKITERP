"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { LevelResponseDto, UpdateLevelDto } from "@klickit/contracts";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useRoles } from "@/features/roles/hooks/use-roles";
import { useUsersLookup } from "../hooks/use-users-lookup";
import { useUpdateLevel } from "../hooks/use-workflow-versions";

type ApproverType = LevelResponseDto["approverType"];
type LevelMode = LevelResponseDto["mode"];

/**
 * Fix-a-typo edit for a single, already-existing level row — the real
 * backend only exposes `PATCH .../levels/:id` (no add/remove), so this is
 * deliberately narrower than `<LevelRowEditor>`: one row, no seq (still not
 * patchable), same approverType/approver/mode/quorum fields.
 */
export function EditLevelDialog({ level, versionId }: { level: LevelResponseDto; versionId: string }) {
  const t = useTranslations("approvals.workflows.levelEditor");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [approverType, setApproverType] = React.useState<ApproverType>(level.approverType);
  const [roleId, setRoleId] = React.useState(level.roleId ?? "");
  const [userIds, setUserIds] = React.useState<string[]>(level.userIds ?? []);
  const [mode, setMode] = React.useState<LevelMode>(level.mode);
  const [quorum, setQuorum] = React.useState(level.quorum);
  const [error, setError] = React.useState<string | null>(null);
  const rolesQuery = useRoles();
  const usersQuery = useUsersLookup();
  const updateMutation = useUpdateLevel(versionId);

  const roleItems = React.useMemo(() => (rolesQuery.data ?? []).map((r) => ({ value: r.id, label: r.name })), [rolesQuery.data]);
  const userOptions = React.useMemo(() => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName })), [usersQuery.data]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setApproverType(level.approverType);
      setRoleId(level.roleId ?? "");
      setUserIds(level.userIds ?? []);
      setMode(level.mode);
      setQuorum(level.quorum);
      setError(null);
    }
  }

  const canSubmit = approverType === "ROLE" ? roleId.length > 0 : approverType === "USERS" ? userIds.length > 0 : true;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateLevelDto = {
      approverType,
      roleId: approverType === "ROLE" ? roleId : null,
      userIds: approverType === "USERS" ? userIds : null,
      mode,
      quorum,
    };
    try {
      await updateMutation.mutateAsync({ levelId: level.id, dto });
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
          <DialogTitle>{t("editTitle", { seq: level.seq })}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("approverType")}</Label>
            <Select value={approverType} onValueChange={(v) => setApproverType(v as ApproverType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ROLE">{t("approverTypeRole")}</SelectItem>
                <SelectItem value="USERS">{t("approverTypeUsers")}</SelectItem>
                <SelectItem value="DEPT_HEAD">{t("approverTypeDeptHead")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {approverType === "ROLE" && (
            <div className="space-y-1.5">
              <Label required>{t("approver")}</Label>
              <Combobox
                items={roleItems}
                value={roleId}
                onChange={setRoleId}
                placeholder={rolesQuery.isLoading ? t("loadingRoles") : t("selectRole")}
                searchPlaceholder={t("searchRoles")}
                emptyText={t("noRolesFound")}
              />
            </div>
          )}
          {approverType === "USERS" && (
            <div className="space-y-1.5">
              <Label required>{t("approver")}</Label>
              <MultiSelect options={userOptions} selected={userIds} onChange={setUserIds} placeholder={t("selectUsers")} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label required>{t("mode")}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as LevelMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SEQUENTIAL">{t("modeSequential")}</SelectItem>
                <SelectItem value="PARALLEL">{t("modeParallel")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("quorum")}</Label>
            <Input
              type="number"
              min={1}
              value={quorum}
              disabled={mode !== "PARALLEL"}
              onChange={(e) => setQuorum(Math.max(1, Number(e.target.value) || 1))}
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
