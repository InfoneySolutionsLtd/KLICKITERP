"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RowActionButton } from "@/components/ui/row-action-button";
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
import type { UpdateDelegationDto } from "@klickit/contracts";
import { ApiError } from "@/lib/api-error";
import type { Delegation } from "../types";
import { UserName } from "./user-name";
import { useUpdateDelegation } from "../hooks/use-delegations";

const REASON_MAX_LENGTH = 200;

/**
 * Edit flow for date range/reason only — `fromUserId`/`toUserId` are shown
 * read-only (via the existing `<UserName>` id-resolver, same as the
 * delegations table itself) since they're immutable server-side
 * (`UpdateDelegationDto` has no such fields); the copy explicitly tells the
 * operator that changing the delegate means delete + recreate, per the
 * plan's own note, rather than leaving that discoverable only by trial and
 * error against a 400 that never comes (the fields simply aren't there to
 * submit).
 */
export function EditDelegationDialog({ delegation }: { delegation: Delegation }) {
  const t = useTranslations("approvals.delegations.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [startsOn, setStartsOn] = React.useState(delegation.startsOn);
  const [endsOn, setEndsOn] = React.useState(delegation.endsOn);
  const [reason, setReason] = React.useState(delegation.reason ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateDelegation();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStartsOn(delegation.startsOn);
      setEndsOn(delegation.endsOn);
      setReason(delegation.reason ?? "");
      setError(null);
    }
  }

  const canSubmit = startsOn.length > 0 && endsOn.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateDelegationDto = {};
    if (startsOn !== delegation.startsOn) dto.startsOn = startsOn;
    if (endsOn !== delegation.endsOn) dto.endsOn = endsOn;
    if (reason.trim() !== (delegation.reason ?? "")) dto.reason = reason.trim() || null;
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: delegation.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <RowActionButton tone="edit" label={tCommon("edit")} onClick={(e) => e.stopPropagation()}>
          <Pencil />
        </RowActionButton>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <Label>{t("fromUserLabel")}</Label>
              <p className="text-foreground">
                <UserName id={delegation.fromUserId} />
              </p>
            </div>
            <div className="space-y-1">
              <Label>{t("toUserLabel")}</Label>
              <p className="text-foreground">
                <UserName id={delegation.toUserId} />
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("immutableUsersHint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("startsOnLabel")}</Label>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("endsOnLabel")}</Label>
              <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("reasonLabel")}</Label>
            <Input value={reason} maxLength={REASON_MAX_LENGTH} onChange={(e) => setReason(e.target.value)} />
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
