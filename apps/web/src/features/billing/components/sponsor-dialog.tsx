"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import type { SponsorResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useCreateSponsor, useUpdateSponsor } from "../hooks/use-sponsors";
import { AgreementFilePicker } from "./agreement-file-picker";

interface ContactRow {
  key: string;
  value: string;
}

function contactsToRows(contacts: Record<string, unknown> | undefined): ContactRow[] {
  if (!contacts) return [];
  return Object.entries(contacts).map(([key, value]) => ({ key, value: typeof value === "string" ? value : String(value) }));
}

function rowsToContacts(rows: ContactRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    result[key] = row.value;
  }
  return result;
}

/**
 * Create/edit `bill_sponsor` dialog+form — same plain controlled-input
 * `Dialog`/`useState` shape as `fee-category-dialog.tsx`/
 * `concession-scheme-dialog.tsx`. No activate/deactivate/delete on
 * `SponsorsController` at all (confirmed by reading it) — a sponsor is
 * permanent once created, so this dialog is the ONLY write surface this
 * module has.
 *
 * **`contacts` (opaque jsonb, no fixed schema)**: a small flat label/value
 * repeater, serialized to a plain object on submit — the same honest
 * free-form treatment Fixed Assets gave its own opaque `insurance` jsonb
 * field (`create-asset-dialog.tsx`'s own doc comment), except `contacts`
 * genuinely benefits from multiple rows (phone/email/address) rather than a
 * single free-text note, so a repeater fits better than a `<Textarea>` here.
 * Duplicate keys silently overwrite (last one wins, same as any plain JS
 * object literal) — not specially guarded against, since `contacts` has no
 * server-side schema to violate either way.
 */
export function SponsorDialog({
  mode,
  sponsor,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  sponsor?: SponsorResponseDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("billing.sponsors.dialog");
  const tCommon = useTranslations("common");

  const [name, setName] = React.useState("");
  const [contactRows, setContactRows] = React.useState<ContactRow[]>([]);
  const [agreementFileId, setAgreementFileId] = React.useState<string | null>(null);
  const [allowsCashConversion, setAllowsCashConversion] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateSponsor();
  const updateMutation = useUpdateSponsor(sponsor?.id ?? "");
  const pending = createMutation.isPending || updateMutation.isPending;

  React.useEffect(() => {
    if (open) {
      setName(sponsor?.name ?? "");
      setContactRows(contactsToRows(sponsor?.contacts as Record<string, unknown> | undefined));
      setAgreementFileId(sponsor?.agreementFileId ?? null);
      setAllowsCashConversion(sponsor?.allowsCashConversion ?? false);
      setError(null);
    }
  }, [open, sponsor]);

  function addContactRow() {
    setContactRows((rows) => [...rows, { key: "", value: "" }]);
  }

  function updateContactRow(index: number, field: "key" | "value", newValue: string) {
    setContactRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: newValue } : row)));
  }

  function removeContactRow(index: number) {
    setContactRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    try {
      const payload = {
        name,
        contacts: rowsToContacts(contactRows),
        agreementFileId: agreementFileId ?? undefined,
        allowsCashConversion,
      };
      if (mode === "create") {
        await createMutation.mutateAsync(payload);
      } else {
        await updateMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("titleCreate") : t("titleEdit")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("contacts")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addContactRow}>
                <Plus className="size-4" />
                {t("addContactRow")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("contactsHint")}</p>
            {contactRows.length > 0 && (
              <div className="space-y-2">
                {contactRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      onChange={(e) => updateContactRow(index, "key", e.target.value)}
                      placeholder={t("contactKeyPlaceholder")}
                      className="w-1/3"
                    />
                    <Input
                      value={row.value}
                      onChange={(e) => updateContactRow(index, "value", e.target.value)}
                      placeholder={t("contactValuePlaceholder")}
                      className="flex-1"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeContactRow(index)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <AgreementFilePicker label={t("agreementFile")} value={agreementFileId} onChange={setAgreementFileId} />

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={allowsCashConversion}
              onChange={(e) => setAllowsCashConversion(e.target.checked)}
              className="size-4 rounded border-input"
            />
            {t("allowsCashConversion")}
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
