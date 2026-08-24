"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { SponsorCombobox } from "./sponsor-combobox";
import { AcademicYearTermSelect } from "./academic-year-term-select";
import { FeeCategoryChipPicker } from "./fee-category-chip-picker";
import { useFeeCategories } from "../hooks/use-fee-categories";
import { useCreateSponsorAward } from "../hooks/use-sponsor-awards";

/**
 * Part 3 (Billing sub-features batch) — create-only `bill_sponsor_award`
 * dialog, self-contained with its own trigger button (same shape
 * `GenerateInvoiceDialog` uses for the Billing card's header action —
 * there's only ever one place this opens from, the student detail page's
 * Sponsor Awards card, so an externally-controlled `open`/`onOpenChange`
 * pair like `FeeCategoryDialog`'s isn't needed here). No edit mode: the
 * backend's `update()` only patches `amount`/`categoryScope`
 * (`sponsor-awards.api.ts`'s own doc comment) and no delete endpoint exists
 * at all — building a full edit flow is optional scope per the plan, so
 * this pass ships create-only, matching `SponsorAwardsTable`'s own
 * read-only listing.
 *
 * `categoryScope` is `CreateSponsorAwardDto`'s one genuinely optional field
 * (`z.array(z.string().uuid()).optional()`) — an empty chip-picker
 * selection is sent as "omit the field entirely" (award applies broadly to
 * any fee category), not `categoryScope: []`, since those are two different
 * server-side semantics and this UI has no way to distinguish "not chosen
 * yet" from "deliberately empty" other than by omission.
 *
 * `appliedAmount` is never a field here — it's server-incremented
 * automatically the next time an invoice for this student+term posts, never
 * set at creation time. The hint text below states this plainly so nobody
 * goes looking for an "apply" control that was never going to exist.
 */
export function SponsorAwardDialog({ studentId }: { studentId: string }) {
  const t = useTranslations("billing.sponsorAwards.dialog");
  const tCommon = useTranslations("common");
  const feeCategoriesQuery = useFeeCategories();

  const [open, setOpen] = React.useState(false);
  const [sponsorId, setSponsorId] = React.useState<string | null>(null);
  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [termId, setTermId] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("");
  const [categoryScope, setCategoryScope] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateSponsorAward(studentId);

  const categoryOptions = React.useMemo(
    () => (feeCategoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [feeCategoriesQuery.data],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSponsorId(null);
      setAcademicYearId(null);
      setTermId(null);
      setAmount("");
      setCategoryScope([]);
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!sponsorId) {
      setError(t("sponsorRequired"));
      return;
    }
    if (!termId) {
      setError(t("termRequired"));
      return;
    }
    if (!amount.trim()) {
      setError(t("amountRequired"));
      return;
    }
    try {
      await createMutation.mutateAsync({
        studentId,
        sponsorId,
        termId,
        amount,
        ...(categoryScope.length > 0 ? { categoryScope } : {}),
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
            <Label required>{t("sponsor")}</Label>
            <SponsorCombobox
              value={sponsorId}
              onChange={setSponsorId}
              placeholder={t("sponsorPlaceholder")}
              searchPlaceholder={t("sponsorSearchPlaceholder")}
              emptyText={t("sponsorEmptyText")}
              loadingText={tCommon("loading")}
            />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("term")}</Label>
            <AcademicYearTermSelect
              academicYearId={academicYearId}
              termId={termId}
              onAcademicYearChange={setAcademicYearId}
              onTermChange={setTermId}
              yearPlaceholder={t("yearPlaceholder")}
              termPlaceholder={t("termPlaceholder")}
              autoSelectCurrent
            />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("amount")}</Label>
            <MoneyInput value={amount} onValueChange={(v) => setAmount(v ?? "")} currency={DEFAULT_CURRENCY} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("categoryScope")}</Label>
            <p className="text-xs text-muted-foreground">{t("categoryScopeHint")}</p>
            <FeeCategoryChipPicker options={categoryOptions} selected={categoryScope} onChange={setCategoryScope} />
          </div>

          <p className="text-xs text-muted-foreground">{t("appliesAutomaticallyHint")}</p>
        </div>

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
