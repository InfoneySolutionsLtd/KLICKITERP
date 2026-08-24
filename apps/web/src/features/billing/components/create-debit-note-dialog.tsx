"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { AcademicYearTermSelect } from "./academic-year-term-select";
import { DocumentLineEditor, emptyDocumentLine, type DocumentLine } from "./document-line-editor";
import { useCreateDebitNote } from "../hooks/use-debit-notes";

/**
 * Phase 6 Slice 22 Part 5 — `studentId` is fixed by the page context (this
 * student's own "Debit Notes" Card, `app/(erp)/students/[id]/page.tsx`).
 * Unlike a Credit Note, a debit note is NOT scoped to any one existing
 * invoice (`debit-notes.service.ts`'s own class doc comment: "unlike a
 * credit note, not scoped to one existing invoice") — it needs its own
 * `termId` instead (`<AcademicYearTermSelect>`, the same cascading picker
 * `generate-invoice-dialog.tsx` uses), and `<DocumentLineEditor
 * descriptionRequired>` is given NO `categoryItems` override, so it falls
 * back to the full active fee-category catalog — no invoice-line
 * restriction applies here the way it does for Credit Notes.
 */
export function CreateDebitNoteDialog({ studentId }: { studentId: string }) {
  const t = useTranslations("billing.debitNotes.dialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [termId, setTermId] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<DocumentLine[]>([emptyDocumentLine()]);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateDebitNote(studentId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAcademicYearId(null);
      setTermId(null);
      setLines([emptyDocumentLine()]);
      setReason("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!termId) {
      setError(t("termRequired"));
      return;
    }
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
      if (!line.description.trim()) {
        setError(t("lineDescriptionRequired"));
        return;
      }
    }
    try {
      await createMutation.mutateAsync({
        studentId,
        termId,
        reason: reason.trim(),
        lines: lines.map((line) => ({ feeCategoryId: line.feeCategoryId, amount: line.amount, description: line.description.trim() })),
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

        <div className="space-y-1.5">
          <Label required>{t("term")}</Label>
          <AcademicYearTermSelect
            academicYearId={academicYearId}
            termId={termId}
            onAcademicYearChange={setAcademicYearId}
            onTermChange={setTermId}
            yearPlaceholder={t("selectYear")}
            termPlaceholder={t("selectTerm")}
            autoSelectCurrent
          />
        </div>

        <div className="space-y-1.5">
          <Label required>{t("reason")}</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required />
        </div>

        <DocumentLineEditor lines={lines} onChange={setLines} descriptionRequired />

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
