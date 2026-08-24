"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import type { StudentOptionalItemResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { AcademicYearTermSelect } from "./academic-year-term-select";
import { OptionalItemDialog } from "./optional-item-dialog";
import { useFeeCategories } from "../hooks/use-fee-categories";
import { useRemoveStudentOptionalItem, useStudentOptionalItems } from "../hooks/use-student-optional-items";

/**
 * Small, local, per-row destructive-confirm — same trigger+confirm-`Dialog`+
 * error-banner shape `VoidInvoiceButton`/`DeleteFeeStructureButton` already
 * established, minus a reason field (removing an enrollment row isn't the
 * kind of permanent, audited action Voiding an invoice is). Not broken out
 * into its own file: it's a one-call-site, card-local piece, the same
 * "small local sub-component" treatment `students/[id]/page.tsx` itself
 * gives `ProfileRow`/`ClassName`/`StreamName`.
 */
function RemoveOptionalItemButton({
  item,
  studentId,
  termId,
  feeCategoryName,
}: {
  item: StudentOptionalItemResponseDto;
  studentId: string;
  termId: string;
  feeCategoryName: string;
}) {
  const t = useTranslations("billing.optionalItems.removeDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const removeMutation = useRemoveStudentOptionalItem(studentId, termId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      await removeMutation.mutateAsync(item.id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="text-destructive hover:bg-tint-destructive hover:text-destructive">
          <Trash2 className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { name: feeCategoryName })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={removeMutation.isPending}>
            {removeMutation.isPending ? t("removing") : t("trigger")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Part 3 (Billing sub-features batch) — term-scoped unit for the student
 * detail page's Optional Items card: `<AcademicYearTermSelect
 * autoSelectCurrent>` at the top (`termId` is required by the list
 * endpoint — see `student-optional-items.api.ts`'s own doc comment), then
 * this student's current opt-ins for the selected term with a per-row
 * Remove button, and an "Add optional item" trigger opening
 * `OptionalItemDialog`.
 *
 * A row's mere existence is the real enrollment signal `InvoicingService`
 * reads at `source: STRUCTURE` invoice-generation time — it must exist
 * BEFORE that term's invoice is generated, no retroactive effect once
 * billing has already run. The hint below states that plainly; it isn't
 * enforced client-side (this UI has no way to know whether that term's
 * invoice has already been generated without a much larger cross-reference,
 * out of scope for this pass), so it's an honest informational note, not a
 * guarantee.
 */
export function OptionalItemsCard({ studentId }: { studentId: string }) {
  const t = useTranslations("billing.optionalItems");
  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [termId, setTermId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const feeCategoriesQuery = useFeeCategories();
  const itemsQuery = useStudentOptionalItems(studentId, termId ?? "");

  const feeCategoryNameById = React.useMemo(
    () => new Map((feeCategoriesQuery.data ?? []).map((c) => [c.id, c.name])),
    [feeCategoriesQuery.data],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AcademicYearTermSelect
          academicYearId={academicYearId}
          termId={termId}
          onAcademicYearChange={setAcademicYearId}
          onTermChange={setTermId}
          yearPlaceholder={t("yearPlaceholder")}
          termPlaceholder={t("termPlaceholder")}
          autoSelectCurrent
        />
        <Button type="button" onClick={() => setDialogOpen(true)} disabled={!termId}>
          <Plus className="size-4" />
          {t("addItem")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t("timingHint")}</p>

      {!termId ? (
        <p className="text-sm text-muted-foreground">{t("selectTermFirst")}</p>
      ) : (
        <QueryBoundary query={itemsQuery} isEmpty={(d) => d.length === 0}>
          {(items) => (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((item) => {
                const feeCategoryName = feeCategoryNameById.get(item.feeCategoryId) ?? item.feeCategoryId;
                return (
                  <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{feeCategoryName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.amountOverride ? t("overrideAmount", { amount: formatMoney(item.amountOverride) }) : t("usingStructureDefault")}
                      </p>
                    </div>
                    <RemoveOptionalItemButton item={item} studentId={studentId} termId={termId} feeCategoryName={feeCategoryName} />
                  </li>
                );
              })}
            </ul>
          )}
        </QueryBoundary>
      )}

      {termId && <OptionalItemDialog studentId={studentId} termId={termId} open={dialogOpen} onOpenChange={setDialogOpen} />}
    </div>
  );
}
