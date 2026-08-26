"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useCreateSavedParams } from "../hooks/use-saved-params";

const NAME_MAX_LENGTH = 120;

/**
 * Always CREATES a new saved-params row. When a saved set is already loaded
 * (`ReportDetailBody`'s `savedParamsId`), this is the "Save as new" half of
 * a Save/Save-As pair — `initialName` pre-fills a starting point (e.g. "{name}
 * (copy)") and `triggerLabel` swaps the button's own copy accordingly;
 * updating the ALREADY-loaded set in place is a separate, plain button
 * (`ReportDetailBody`'s own "Update saved report" action, `useUpdateSavedParams()`),
 * not this dialog.
 */
export function SaveParamsDialog({
  reportCode,
  params,
  disabled,
  triggerLabel,
  initialName,
}: {
  reportCode: string;
  params: Record<string, unknown>;
  disabled?: boolean;
  triggerLabel?: string;
  initialName?: string;
}) {
  const t = useTranslations("reports.detail.saveParamsDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(initialName ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateSavedParams();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(initialName ?? "");
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ reportCode, name: name.trim(), params });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <Save className="size-4" />
          {triggerLabel ?? t("trigger")}
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

        <div className="space-y-1.5">
          <Label required>{t("nameLabel")}</Label>
          <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
