"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useInvoiceLines } from "../hooks/use-invoices";
import { useCreateCreditNote } from "../hooks/use-credit-notes";
import { useFeeCategories } from "../hooks/use-fee-categories";
import { DocumentLineEditor, emptyDocumentLine, type DocumentLine } from "./document-line-editor";

/**
 * Phase 6 Slice 22 Part 5 — `invoiceId` is fixed by the page context (this
 * invoice's own "Credit Notes" section, `app/(erp)/billing/invoices/[id]/page.tsx`
 * — never picked by the user, unlike a Debit Note's studentId+term).
 *
 * `CreditNotesService.create()` hard-rejects any line whose `feeCategoryId`
 * doesn't already appear on the target invoice's own lines ("a credit note
 * line must reference an original invoice line") and caps each line's amount
 * at that original line's own full `amount` — so this dialog fetches the
 * invoice's own lines (`useInvoiceLines`, already exported by `use-invoices.ts`)
 * to build BOTH the category combobox's option list (restricted to real
 * lines only, so the picker can't offer a choice guaranteed to 400) and the
 * per-category max-amount hint passed to `<DocumentLineEditor>` — see that
 * component's own doc comment for why the hint is the original line's FULL
 * amount, not a "remaining after prior notes" figure (the server itself
 * doesn't net that out at `create()` time either).
 */
export function CreateCreditNoteDialog({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("billing.creditNotes.dialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [lines, setLines] = React.useState<DocumentLine[]>([emptyDocumentLine()]);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const invoiceLinesQuery = useInvoiceLines(invoiceId);
  const categoriesQuery = useFeeCategories();
  const createMutation = useCreateCreditNote(invoiceId);

  const categoryNameById = React.useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])),
    [categoriesQuery.data],
  );
  const categoryItems = React.useMemo(
    () =>
      (invoiceLinesQuery.data ?? []).map((line) => ({
        value: line.feeCategoryId,
        label: categoryNameById.get(line.feeCategoryId) ?? line.feeCategoryId,
      })),
    [invoiceLinesQuery.data, categoryNameById],
  );
  const maxAmountByCategory = React.useMemo(
    () => new Map((invoiceLinesQuery.data ?? []).map((line) => [line.feeCategoryId, line.amount])),
    [invoiceLinesQuery.data],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLines([emptyDocumentLine()]);
      setReason("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!reason.trim()) {
      setError(t("reasonRequired"));
      return;
    }
    for (const line of lines) {
      if (!line.feeCategoryId) {
        setError(t("categoryRequired"));
        return;
      }
      if (!line.amount) {
        setError(t("amountRequired"));
        return;
      }
    }
    try {
      await createMutation.mutateAsync({
        invoiceId,
        reason: reason.trim(),
        lines: lines.map((line) => ({
          feeCategoryId: line.feeCategoryId,
          amount: line.amount,
          description: line.description.trim() || undefined,
        })),
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {invoiceLinesQuery.isSuccess && categoryItems.length === 0 && (
          <Alert variant="warning">
            <AlertDescription>{t("noInvoiceLinesHint")}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("reason")}</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required />
        </div>

        <DocumentLineEditor
          lines={lines}
          onChange={setLines}
          descriptionRequired={false}
          categoryItems={categoryItems}
          categoriesLoading={invoiceLinesQuery.isLoading}
          maxAmountByCategory={maxAmountByCategory}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={createMutation.isPending}>
            {createMutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
