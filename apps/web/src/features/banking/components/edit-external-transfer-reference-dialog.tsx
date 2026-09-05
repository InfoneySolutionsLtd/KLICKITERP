"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useUpdateExternalTransferReference } from "../hooks/use-external-transfers";

/** Mirrors `edit-transfer-reference-dialog.tsx` exactly — see that component's own doc comment. */
export function EditExternalTransferReferenceDialog({ transferId, currentValue }: { transferId: string; currentValue: string | null }) {
  const t = useTranslations("banking.externalTransfers.detail");
  const [open, setOpen] = React.useState(false);
  const [referenceNo, setReferenceNo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const mutation = useUpdateExternalTransferReference();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReferenceNo(currentValue ?? "");
      setError(null);
    }
  }

  async function handleSave() {
    if (!referenceNo.trim()) return;
    setError(null);
    try {
      await mutation.mutateAsync({ id: transferId, referenceNo: referenceNo.trim() });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("editReferenceError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Pencil className="size-3.5" />
          {t("editReference")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editReferenceTitle")}</DialogTitle>
          <DialogDescription>{t("editReferenceDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("referenceNoLabel")}</Label>
          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} maxLength={60} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t("editReferenceCancel")}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={!referenceNo.trim() || mutation.isPending}>
            {mutation.isPending ? t("editReferenceSaving") : t("editReferenceSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
