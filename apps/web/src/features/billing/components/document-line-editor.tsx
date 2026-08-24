"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/patterns/money-input";
import { DEFAULT_CURRENCY, formatMoney, isValidDecimalString } from "@/lib/money";
import { useFeeCategories } from "../hooks/use-fee-categories";

export interface DocumentLine {
  feeCategoryId: string;
  description: string;
  amount: string;
}

export function emptyDocumentLine(): DocumentLine {
  return { feeCategoryId: "", description: "", amount: "" };
}

/** Minimal BigInt-scaled decimal `a > b` compare — same never-`parseFloat` discipline `lib/money.ts` establishes, kept local since this component is the only caller that needs a boolean comparison rather than formatting/summing a money string. */
function exceedsMoney(a: string, b: string): boolean {
  if (!isValidDecimalString(a) || !isValidDecimalString(b)) return false;
  const scaleOf = (v: string) => (v.trim().split(".")[1] ?? "").length;
  const scale = Math.max(scaleOf(a), scaleOf(b), 4);
  const toScaled = (v: string) => {
    const trimmed = v.trim();
    const negative = trimmed.startsWith("-");
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
    const scaled = BigInt(intPartRaw || "0") * 10n ** BigInt(scale) + BigInt(fracPartRaw.padEnd(scale, "0").slice(0, scale) || "0");
    return negative ? -scaled : scaled;
  };
  return toScaled(a) > toScaled(b);
}

/**
 * Phase 6 Slice 22 Part 5 (Credit Notes + Debit Notes) — shared line-repeater
 * for both create dialogs. Unlike `fee-structure-line-form.tsx`'s inline
 * "add one line, POST immediately" pattern (a real per-line mutation against
 * an already-persisted DRAFT structure), `CreateCreditNoteDto`/
 * `CreateDebitNoteDto` each take their WHOLE `lines[]` array in a single
 * `create()` call — so this component only manages local array state via
 * `lines`/`onChange`, the same controlled-array shape `fee-structure-line-form.tsx`
 * uses for its own row inputs, just without the per-row server round-trip.
 *
 * `descriptionRequired` — Credit Note lines have an OPTIONAL `description`
 * (`CreateCreditNoteLineDtoSchema`; `CreditNotesService.create()` falls back
 * to the fee category's own name when omitted). Debit Note lines REQUIRE one
 * (`CreateDebitNoteLineDtoSchema`, no schema-level `.optional()`, no
 * server-side fallback). The caller sets this per its own DTO shape rather
 * than this component guessing which document type it's inside.
 *
 * `categoryItems` — when supplied, used as-is. `create-credit-note-dialog.tsx`
 * passes ONLY the fee categories that actually appear on the target
 * invoice's own lines — `CreditNotesService.create()` hard-rejects any other
 * category (`"...a credit note line must reference an original invoice
 * line"`), so offering the full catalog there would let a user pick an
 * option guaranteed to 400. Omitted (the default), this falls back to every
 * ACTIVE fee category (`useFeeCategories()`, same `.isActive` filter
 * `fee-structure-line-form.tsx` itself uses) — Debit Notes have no such
 * per-invoice restriction (`DebitNotesService` doesn't scope to any existing
 * invoice at all), so `create-debit-note-dialog.tsx` uses this default.
 *
 * `maxAmountByCategory` — optional per-category ceiling HINT (Credit Note
 * only). `CreditNotesService.create()` caps each line at the ORIGINAL
 * invoice line's own full `amount` — but, per that service's own doc
 * comment, "does not attempt to net out prior credit notes against the same
 * line at create() time" (a real, documented lighter validation than
 * BR-BILL-06's own remaining-balance tracking). This hint therefore shows
 * the original line's full amount, not a "remaining after prior notes"
 * figure this frontend has no cheap way to compute correctly — a
 * non-blocking `text-warning-foreground` note when exceeded, never a
 * disabled submit button; the server is the real enforcement.
 */
export function DocumentLineEditor({
  lines,
  onChange,
  descriptionRequired,
  categoryItems,
  categoriesLoading,
  maxAmountByCategory,
}: {
  lines: DocumentLine[];
  onChange: (lines: DocumentLine[]) => void;
  descriptionRequired: boolean;
  categoryItems?: ComboboxItem[];
  /** Only consulted when `categoryItems` is supplied — the caller's own loading state for that list (e.g. the target invoice's lines still fetching). Ignored (in favor of `useFeeCategories()`'s own `isLoading`) when `categoryItems` is omitted. */
  categoriesLoading?: boolean;
  maxAmountByCategory?: Map<string, string>;
}) {
  const t = useTranslations("billing.documentLineEditor");
  const categoriesQuery = useFeeCategories();

  const defaultCategoryItems = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    [categoriesQuery.data],
  );
  const items = categoryItems ?? defaultCategoryItems;
  const loading = categoryItems ? (categoriesLoading ?? false) : categoriesQuery.isLoading;

  function updateLine(index: number, patch: Partial<DocumentLine>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    onChange([...lines, emptyDocumentLine()]);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        const max = line.feeCategoryId ? maxAmountByCategory?.get(line.feeCategoryId) : undefined;
        const exceedsHint = max !== undefined && line.amount ? exceedsMoney(line.amount, max) : false;
        return (
          <div key={index} className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_auto]">
              <div className="space-y-1.5">
                <Label required>{t("category")}</Label>
                <Combobox
                  items={items}
                  value={line.feeCategoryId}
                  onChange={(value) => updateLine(index, { feeCategoryId: value })}
                  placeholder={t("selectCategory")}
                  searchPlaceholder={t("searchCategory")}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label required={descriptionRequired}>{t("description")}</Label>
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(index, { description: e.target.value })}
                  maxLength={160}
                  placeholder={descriptionRequired ? undefined : t("descriptionOptionalHint")}
                />
              </div>
              <div className="space-y-1.5">
                <Label required>{t("amount")}</Label>
                <MoneyInput value={line.amount} onValueChange={(v) => updateLine(index, { amount: v ?? "" })} currency={DEFAULT_CURRENCY} />
                {max !== undefined && (
                  <p className={exceedsHint ? "text-xs text-warning-foreground" : "text-xs text-muted-foreground"}>
                    {t("maxHint", { amount: formatMoney(max) })}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="self-end text-destructive hover:bg-tint-destructive hover:text-destructive"
                onClick={() => removeLine(index)}
                disabled={lines.length <= 1}
                aria-label={t("removeLine")}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" onClick={addLine}>
        <Plus className="size-4" />
        {t("addLine")}
      </Button>
    </div>
  );
}
