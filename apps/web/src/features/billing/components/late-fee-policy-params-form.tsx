"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/patterns/money-input";
import { DEFAULT_CURRENCY } from "@/lib/money";

export type LateFeePolicyMode = "FLAT" | "PERCENT" | "TIERED";

/** The raw wire shape of one entry in `params.tiers[]` — see `LateFeePoliciesService`'s own doc comment (`packages/server/src/domains/billing/application/late-fee-policies.service.ts`) for the authoritative field list. */
interface RawTier {
  minDaysOverdue: number;
  maxDaysOverdue?: number;
  amount?: string;
  rate?: string;
}

/**
 * Mode-conditional sub-form for `bill_late_fee_policy.params` — the one
 * genuinely bespoke piece in this batch (every other Billing screen this pass
 * ships is a copy-pasted CRUD dialog). `params` itself is opaque `jsonb`,
 * validated server-side only as `@IsObject()` (confirmed by reading
 * `late-fee-policy.dto.ts`), so this component is a soft client-side shape
 * enforcer, not a hard validator — it always reads/writes exactly the field
 * names `LateFeePoliciesService`'s own doc comment documents per mode:
 *  - `FLAT`: `{ amount: string }`
 *  - `PERCENT`: `{ rate: string }` — a decimal FRACTION (e.g. `"0.05"` for
 *    5%), per that same doc comment — NOT a whole-number percentage. This is
 *    a deliberate deviation from this feature's own task brief, which
 *    suggested "e.g. 5 for 5%" as illustrative copy; the actual backend
 *    service doc comment (the source of truth this component was told to
 *    verify against) says otherwise, so the hint text here follows the real
 *    backend contract instead of the brief's example.
 *  - `TIERED`: `{ tiers: [{ minDaysOverdue, maxDaysOverdue?, amount?, rate? }] }`
 *    — a repeater, mirroring `journal-line-editor.tsx`'s own controlled
 *    `rows`/`onChange` table-repeater shape. Each row offers amount AND rate
 *    side by side (not a toggle) — "either one" is enough per the brief, and
 *    two plain optional inputs are simpler than a mode-toggle for a 2-field
 *    row. Rows are keyed by array index — this codebase's own
 *    `journal-line-editor.tsx` accepts the same simplification for an
 *    append/remove-only repeater with no drag-reorder.
 *
 * Fully controlled: `value`/`onChange` carry the whole `params` object
 * (never internal duplicate state), matching the plan's own "value/onChange
 * for the params object" instruction.
 */
export function LateFeePolicyParamsForm({
  mode,
  value,
  onChange,
}: {
  mode: LateFeePolicyMode;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const t = useTranslations("billing.lateFeePolicies.paramsForm");

  if (mode === "FLAT") {
    const amount = typeof value.amount === "string" ? value.amount : "";
    return (
      <div className="space-y-1.5">
        <Label required>{t("flatAmount")}</Label>
        <MoneyInput value={amount} onValueChange={(v) => onChange({ amount: v ?? "" })} currency={DEFAULT_CURRENCY} />
        <p className="text-xs text-muted-foreground">{t("flatAmountHint")}</p>
      </div>
    );
  }

  if (mode === "PERCENT") {
    const rate = typeof value.rate === "string" ? value.rate : "";
    return (
      <div className="space-y-1.5">
        <Label required>{t("percentRate")}</Label>
        <Input inputMode="decimal" value={rate} onChange={(e) => onChange({ rate: e.target.value })} placeholder="0.05" />
        <p className="text-xs text-muted-foreground">{t("percentRateHint")}</p>
      </div>
    );
  }

  const tiers = Array.isArray(value.tiers) ? (value.tiers as RawTier[]) : [];

  function patchTier(index: number, patch: Partial<RawTier>) {
    const next = tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier));
    onChange({ ...value, tiers: next });
  }

  function addTier() {
    onChange({ ...value, tiers: [...tiers, { minDaysOverdue: 0 }] });
  }

  function removeTier(index: number) {
    onChange({ ...value, tiers: tiers.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-3">
      <Label>{t("tiersLabel")}</Label>
      <p className="text-xs text-muted-foreground">{t("tiersHint")}</p>

      {tiers.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("minDaysOverdue")}</TableHead>
                <TableHead>{t("maxDaysOverdue")}</TableHead>
                <TableHead>{t("tierAmount")}</TableHead>
                <TableHead>{t("tierRate")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((tier, index) => (
                <TableRow key={index}>
                  <TableCell className="min-w-[120px]">
                    <Input
                      type="number"
                      min={0}
                      value={Number.isFinite(tier.minDaysOverdue) ? String(tier.minDaysOverdue) : ""}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        patchTier(index, { minDaysOverdue: Number.isNaN(parsed) ? 0 : parsed });
                      }}
                    />
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    <Input
                      type="number"
                      min={0}
                      value={tier.maxDaysOverdue !== undefined ? String(tier.maxDaysOverdue) : ""}
                      placeholder={t("openEnded")}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw.trim() === "") {
                          const { maxDaysOverdue: _drop, ...rest } = tier;
                          void _drop;
                          const next = tiers.map((row, i) => (i === index ? rest : row));
                          onChange({ ...value, tiers: next });
                          return;
                        }
                        const parsed = Number(raw);
                        if (!Number.isNaN(parsed)) patchTier(index, { maxDaysOverdue: parsed });
                      }}
                    />
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <MoneyInput
                      value={tier.amount ?? ""}
                      onValueChange={(v) => {
                        if (!v) {
                          const { amount: _drop, ...rest } = tier;
                          void _drop;
                          const next = tiers.map((row, i) => (i === index ? rest : row));
                          onChange({ ...value, tiers: next });
                          return;
                        }
                        patchTier(index, { amount: v });
                      }}
                      currency={DEFAULT_CURRENCY}
                    />
                  </TableCell>
                  <TableCell className="min-w-[100px]">
                    <Input
                      inputMode="decimal"
                      value={tier.rate ?? ""}
                      placeholder="0.05"
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw.trim() === "") {
                          const { rate: _drop, ...rest } = tier;
                          void _drop;
                          const next = tiers.map((row, i) => (i === index ? rest : row));
                          onChange({ ...value, tiers: next });
                          return;
                        }
                        patchTier(index, { rate: raw });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeTier(index)} aria-label={t("removeTier")}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addTier}>
        <Plus className="size-4" />
        {t("addTier")}
      </Button>
    </div>
  );
}
