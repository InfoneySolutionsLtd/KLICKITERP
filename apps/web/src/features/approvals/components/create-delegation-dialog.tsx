"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
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
import { ApiError } from "@/lib/api-error";
import { useUsersLookup } from "../hooks/use-users-lookup";
import { useCreateDelegation } from "../hooks/use-delegations";

const REASON_MAX_LENGTH = 200;

/** `fromUserId !== toUserId` and `startsOn <= endsOn` are both enforced server-side (`DelegationsService`) — this dialog surfaces the real 422 message verbatim rather than duplicating the validation client-side, same discipline the rest of this codebase's dialogs already follow for server-owned business rules. */
export function CreateDelegationDialog() {
  const t = useTranslations("approvals.delegations.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [fromUserId, setFromUserId] = React.useState("");
  const [toUserId, setToUserId] = React.useState("");
  const [startsOn, setStartsOn] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const usersQuery = useUsersLookup();
  const createMutation = useCreateDelegation();

  const userItems = React.useMemo(() => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName })), [usersQuery.data]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFromUserId("");
      setToUserId("");
      setStartsOn("");
      setEndsOn("");
      setReason("");
      setError(null);
    }
  }

  const canSubmit = fromUserId.length > 0 && toUserId.length > 0 && startsOn.length > 0 && endsOn.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        fromUserId,
        toUserId,
        startsOn,
        endsOn,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
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
          <div className="space-y-1.5">
            <Label required>{t("fromUserLabel")}</Label>
            <Combobox
              items={userItems}
              value={fromUserId}
              onChange={setFromUserId}
              placeholder={usersQuery.isLoading ? t("loadingUsers") : t("selectUser")}
              searchPlaceholder={t("searchUsers")}
              emptyText={t("noUsersFound")}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("toUserLabel")}</Label>
            <Combobox
              items={userItems}
              value={toUserId}
              onChange={setToUserId}
              placeholder={usersQuery.isLoading ? t("loadingUsers") : t("selectUser")}
              searchPlaceholder={t("searchUsers")}
              emptyText={t("noUsersFound")}
            />
          </div>
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
            <Input value={reason} maxLength={REASON_MAX_LENGTH} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
