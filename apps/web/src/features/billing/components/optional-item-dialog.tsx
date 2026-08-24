"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { useFeeCategories } from "../hooks/use-fee-categories";
import { useCreateStudentOptionalItem } from "../hooks/use-student-optional-items";

/**
 * Part 3 (Billing sub-features batch) — create dialog for one
 * `bill_student_optional_item` enrollment row. Externally-controlled
 * `open`/`onOpenChange` (`fee-category-dialog.tsx`'s shape), since its
 * parent (`OptionalItemsCard`) needs to gate the trigger on a term being
 * selected first, unlike `SponsorAwardDialog`'s self-contained trigger.
 *
 * Uses the generic single-select `<Combobox>` primitive directly, NOT
 * `FeeCategoryChipPicker` — that component is multi-select-by-design (its
 * `onChange` reports a `string[]`), the wrong shape here: this dialog issues
 * exactly one `POST` per fee category, one category at a time (the plan's
 * own explicit instruction).
 *
 * Catches the real `409 ConflictException`
 * `StudentOptionalItemsService.create()` throws on a duplicate
 * `(studentId, termId, feeCategoryId)` (see `student-optional-items.api.ts`'s
 * own doc comment) and renders a specific, friendly message instead of the
 * raw backend sentence — the one real, documented error path this dialog
 * needs to handle by hand.
 */
export function OptionalItemDialog({
  studentId,
  termId,
  open,
  onOpenChange,
}: {
  studentId: string;
  termId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("billing.optionalItems.dialog");
  const tCommon = useTranslations("common");
  const feeCategoriesQuery = useFeeCategories();

  const [feeCategoryId, setFeeCategoryId] = React.useState("");
  const [amountOverride, setAmountOverride] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateStudentOptionalItem(studentId, termId);

  React.useEffect(() => {
    if (open) {
      setFeeCategoryId("");
      setAmountOverride("");
      setError(null);
    }
  }, [open]);

  // Scope decision (per the plan): shows ALL fee categories, not filtered to
  // only those actually marked optional on the student's current fee
  // structure — a non-optional selection is a harmless server-side no-op
  // (`InvoicingService` only ever consults this row's existence for lines
  // it already knows are `isOptional=true`), and a real cross-reference of
  // fee-structure lines by class+term would be disproportionate effort for
  // this pass.
  const categoryOptions = React.useMemo(
    () => (feeCategoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [feeCategoriesQuery.data],
  );

  async function handleSubmit() {
    setError(null);
    if (!feeCategoryId) {
      setError(t("feeCategoryRequired"));
      return;
    }
    try {
      await createMutation.mutateAsync({
        studentId,
        termId,
        feeCategoryId,
        ...(amountOverride.trim() ? { amountOverride } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("duplicateError"));
      } else {
        setError(err instanceof ApiError ? err.message : t("genericError"));
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Label required>{t("feeCategory")}</Label>
            <Combobox
              items={categoryOptions}
              value={feeCategoryId}
              onChange={setFeeCategoryId}
              placeholder={feeCategoriesQuery.isLoading ? tCommon("loading") : t("feeCategoryPlaceholder")}
              searchPlaceholder={t("feeCategorySearchPlaceholder")}
              emptyText={t("feeCategoryEmptyText")}
              disabled={feeCategoriesQuery.isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("amountOverride")}</Label>
            <MoneyInput value={amountOverride} onValueChange={(v) => setAmountOverride(v ?? "")} currency={DEFAULT_CURRENCY} />
            <p className="text-xs text-muted-foreground">{t("amountOverrideHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
