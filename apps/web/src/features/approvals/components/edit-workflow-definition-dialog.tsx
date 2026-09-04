"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { UpdateWorkflowDefDto } from "@klickit/contracts";
import { ApiError } from "@/lib/api-error";
import type { WorkflowDef } from "../types";
import { useUpdateWorkflowDefinition } from "../hooks/use-workflow-definitions";

const NAME_MAX_LENGTH = 80;

/**
 * Edit flow for an existing definition — name + isActive only.
 * `domainCode` is shown read-only (immutable server-side, not part of
 * `UpdateWorkflowDefDto`) rather than faked as an editable field, same
 * "immutable fields shown, not disabled-but-editable-looking" precedent
 * `EditRoleDialog` established for `isAuditorClass`. Unchecking "Active" is
 * this definition's archive action — there is no separate delete route.
 */
export function EditWorkflowDefinitionDialog({ workflowDef }: { workflowDef: WorkflowDef }) {
  const t = useTranslations("approvals.workflows.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(workflowDef.name);
  const [isActive, setIsActive] = React.useState(workflowDef.isActive);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateWorkflowDefinition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(workflowDef.name);
      setIsActive(workflowDef.isActive);
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateWorkflowDefDto = {};
    if (name.trim() !== workflowDef.name) dto.name = name.trim();
    if (isActive !== workflowDef.isActive) dto.isActive = isActive;
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: workflowDef.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
          <Pencil className="size-4" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("title", { name: workflowDef.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("domainCodeLabel")}</Label>
            <Badge variant="soft-secondary" className="font-mono">
              {workflowDef.domainCode}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 pt-1 text-sm text-foreground">
            <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="mt-0.5" />
            <div>
              <span>{t("isActiveLabel")}</span>
              <p className="text-xs font-normal text-muted-foreground">{t("isActiveHint")}</p>
            </div>
          </label>
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
