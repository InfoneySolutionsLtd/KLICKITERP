"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ConcessionSchemeResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useCreateConcessionScheme, useUpdateConcessionScheme } from "../hooks/use-concession-schemes";
import { useFeeCategories } from "../hooks/use-fee-categories";
import { GlAccountSelect } from "./gl-account-select";
import { FeeCategoryChipPicker } from "./fee-category-chip-picker";

const BILL_CONCESSION_KINDS = ["WAIVER", "DISCOUNT", "SCHOLARSHIP", "BURSARY"] as const;
const BILL_CONCESSION_CALCS = ["PERCENT", "FIXED"] as const;

/**
 * Create/edit `bill_concession_scheme` dialog+form — the same plain
 * controlled-input `Dialog`/`useState` shape `fee-category-dialog.tsx`
 * establishes for small forms in this codebase (NOT react-hook-form).
 * `UpdateConcessionSchemeDto` has no `isActive` field (confirmed by reading
 * `concession-scheme.dto.ts`) — activate/deactivate is a separate action on
 * the detail page, same split fee-categories/classes establish elsewhere.
 *
 * `glAccountId` is the DEBIT/contra side of the concession posting
 * (P-02/P-04 in `PostingService`) — an EXPENSE-class account, not income,
 * hence `<GlAccountSelect accountClass="EXPENSE">` rather than the
 * Fee Category dialog's default INCOME picker.
 */
export function ConcessionSchemeDialog({
  mode,
  scheme,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  scheme?: ConcessionSchemeResponseDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("billing.concessionSchemes.dialog");
  const tKinds = useTranslations("billing.concessionSchemes.kindValues");
  const tCalcs = useTranslations("billing.concessionSchemes.calcValues");
  const tCommon = useTranslations("common");

  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<(typeof BILL_CONCESSION_KINDS)[number]>("WAIVER");
  const [calc, setCalc] = React.useState<(typeof BILL_CONCESSION_CALCS)[number]>("PERCENT");
  const [value, setValue] = React.useState("");
  const [categoryScope, setCategoryScope] = React.useState<string[]>([]);
  const [allowsStacking, setAllowsStacking] = React.useState(false);
  const [glAccountId, setGlAccountId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const feeCategoriesQuery = useFeeCategories();
  const createMutation = useCreateConcessionScheme();
  const updateMutation = useUpdateConcessionScheme(scheme?.id ?? "");
  const pending = createMutation.isPending || updateMutation.isPending;

  React.useEffect(() => {
    if (open) {
      setName(scheme?.name ?? "");
      setKind((scheme?.kind as (typeof BILL_CONCESSION_KINDS)[number]) ?? "WAIVER");
      setCalc((scheme?.calc as (typeof BILL_CONCESSION_CALCS)[number]) ?? "PERCENT");
      setValue(scheme?.value ?? "");
      setCategoryScope(scheme?.categoryScope ?? []);
      setAllowsStacking(scheme?.allowsStacking ?? false);
      setGlAccountId(scheme?.glAccountId ?? "");
      setError(null);
    }
  }, [open, scheme]);

  const categoryOptions = React.useMemo(
    () => (feeCategoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [feeCategoriesQuery.data],
  );

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!value.trim()) {
      setError(t("valueRequired"));
      return;
    }
    if (!glAccountId.trim()) {
      setError(t("glAccountRequired"));
      return;
    }
    try {
      if (mode === "create") {
        // `CreateConcessionSchemeDto.categoryScope` is plain `string[] |
        // undefined` (no `null`) — `ConcessionSchemesService.create()`
        // already normalizes an omitted scope to `null` server-side
        // (`input.categoryScope ?? null`), so an empty selection simply
        // omits the field, nothing further to do here.
        await createMutation.mutateAsync({
          name,
          kind,
          calc,
          value,
          categoryScope: categoryScope.length > 0 ? categoryScope : undefined,
          allowsStacking,
          glAccountId,
        });
      } else {
        // `UpdateConcessionSchemeDto.categoryScope` is genuinely `string[] |
        // null | undefined` (widened from `string[] | undefined` — see that
        // DTO's own doc comment for why): `undefined` means "leave the
        // current scope untouched", `null` explicitly clears it back to
        // "any category". An empty chip selection is ambiguous on its own
        // (never touched vs. deliberately cleared), so it's resolved by
        // comparing against the scheme's own current scope: only send an
        // explicit `null` when the scheme actually HAD a real scope that's
        // now empty (a genuine clear); if it was already empty, omit the
        // field entirely rather than sending a no-op `null` on every save.
        const hadScope = (scheme?.categoryScope?.length ?? 0) > 0;
        const categoryScopeChange: string[] | null | undefined =
          categoryScope.length > 0 ? categoryScope : hadScope ? null : undefined;
        await updateMutation.mutateAsync({
          name,
          kind,
          calc,
          value,
          categoryScope: categoryScopeChange,
          allowsStacking,
          glAccountId,
        });
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
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("kind")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as (typeof BILL_CONCESSION_KINDS)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILL_CONCESSION_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tKinds(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("calc")}</Label>
              <Select value={calc} onValueChange={(v) => setCalc(v as (typeof BILL_CONCESSION_CALCS)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILL_CONCESSION_CALCS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {tCalcs(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{calc === "PERCENT" ? t("valuePercent") : t("valueFixed")}</Label>
            <MoneyInput value={value} onValueChange={(v) => setValue(v ?? "")} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("categoryScope")}</Label>
            <p className="text-xs text-muted-foreground">{t("categoryScopeHint")}</p>
            <FeeCategoryChipPicker options={categoryOptions} selected={categoryScope} onChange={setCategoryScope} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("glAccount")}</Label>
            <GlAccountSelect value={glAccountId} onChange={setGlAccountId} accountClass="EXPENSE" />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={allowsStacking}
              onChange={(e) => setAllowsStacking(e.target.checked)}
              className="size-4 rounded border-input"
            />
            {t("allowsStacking")}
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
