"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/money";
import { useStudentCreditBalance } from "../hooks/use-student-credit";
import { useCreateRefundVoucher } from "../hooks/use-refund-vouchers";

const REFUND_METHODS = ["CASH", "BANK", "MPESA_B2C"] as const;
type RefundMethod = (typeof REFUND_METHODS)[number];

interface PayeeRow {
  key: string;
  value: string;
}

function rowsToPayee(rows: PayeeRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    result[key] = row.value;
  }
  return result;
}

/**
 * Decimal-string "does `amount` exceed `available`" check, BigInt-scaled the
 * same way `lib/money.ts`'s own `formatMoney()`/`sumMoneyStrings()` are —
 * never `parseFloat`/`Number()` on a money value, per this codebase's own
 * discipline (`lib/money.ts`'s file-level doc comment). Local to this dialog
 * only (a soft client-side preview, not shared validation logic) — the real
 * enforcement is server-side (BR-BILL-12, `RefundVouchersService.create()`).
 */
function exceedsAvailable(amount: string, available: string): boolean {
  const scale = 4;
  const factor = 10n ** BigInt(scale);
  function toScaled(v: string): bigint {
    const trimmed = v.trim();
    const negative = trimmed.startsWith("-");
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
    const intPart = intPartRaw || "0";
    const fracPadded = fracPartRaw.padEnd(scale, "0").slice(0, scale);
    const scaled = BigInt(intPart) * factor + BigInt(fracPadded || "0");
    return negative ? -scaled : scaled;
  }
  return toScaled(amount) > toScaled(available);
}

/**
 * Part 6 (Billing sub-features batch) — `POST billing/refund-vouchers`,
 * `studentId` fixed by page context (this student's own "Refund Vouchers"
 * Card, `app/(erp)/students/[id]/page.tsx`), matching
 * `create-debit-note-dialog.tsx`'s own context-fixed-studentId shape.
 *
 * **Credit balance ceiling**: `useStudentCreditBalance(studentId)` (the same
 * hook `credit-balance-card.tsx` already uses) is shown live next to the
 * amount field as a preview only — BR-BILL-12's real enforcement is
 * server-side (`RefundVouchersService.create()` caps `amount` at the
 * student's real current credit balance, computed from their ledger). This
 * dialog never blocks submit on it — a stale/racing balance client-side is
 * expected and the server's own `400` (surfaced via `ApiError.message`) is
 * the actual source of truth if it's exceeded.
 *
 * **`payee` (opaque jsonb, no fixed schema)**: the exact same small flat
 * label/value repeater `sponsor-dialog.tsx` built for `Sponsor.contacts` —
 * copied here rather than shared, matching this codebase's per-dialog
 * self-containment for small one-off form pieces (`sponsor-dialog.tsx`
 * itself isn't exported as reusable infra). Not required — `payee: {}` is a
 * valid submission (`CreateRefundVoucherDto.payee` only requires an object,
 * not specific keys), but the hint below nudges toward at least a name.
 */
export function CreateRefundVoucherDialog({ studentId }: { studentId: string }) {
  const t = useTranslations("billing.refundVouchers.dialog");
  const tMethod = useTranslations("billing.refundVouchers.methodValues");
  const tCommon = useTranslations("common");

  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<RefundMethod>("CASH");
  const [payeeRows, setPayeeRows] = React.useState<PayeeRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const creditBalanceQuery = useStudentCreditBalance(studentId);
  const createMutation = useCreateRefundVoucher(studentId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(null);
      setMethod("CASH");
      setPayeeRows([]);
      setError(null);
    }
  }

  function addPayeeRow() {
    setPayeeRows((rows) => [...rows, { key: "", value: "" }]);
  }
  function updatePayeeRow(index: number, field: "key" | "value", newValue: string) {
    setPayeeRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: newValue } : row)));
  }
  function removePayeeRow(index: number) {
    setPayeeRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError(null);
    if (!amount) {
      setError(t("amountRequired"));
      return;
    }
    try {
      await createMutation.mutateAsync({
        studentId,
        amount,
        method,
        payee: rowsToPayee(payeeRows),
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const available = creditBalanceQuery.data?.balance;
  const showsOverCeilingHint = !!amount && !!available && exceedsAvailable(amount, available);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
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
            <Label required>{t("amount")}</Label>
            <MoneyInput value={amount ?? ""} onValueChange={setAmount} currency={DEFAULT_CURRENCY} />
            <p className="text-xs text-muted-foreground">
              {creditBalanceQuery.data ? t("creditBalanceHint", { balance: formatMoney(creditBalanceQuery.data.balance) }) : t("creditBalanceLoading")}
            </p>
            {showsOverCeilingHint && (
              <p className="text-xs text-warning-foreground">{t("creditBalanceExceededHint")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label required>{t("method")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as RefundMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFUND_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tMethod(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("payee")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addPayeeRow}>
                <Plus className="size-4" />
                {t("addPayeeRow")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("payeeHint")}</p>
            {payeeRows.length > 0 && (
              <div className="space-y-2">
                {payeeRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      onChange={(e) => updatePayeeRow(index, "key", e.target.value)}
                      placeholder={t("payeeKeyPlaceholder")}
                      className="w-1/3"
                    />
                    <Input
                      value={row.value}
                      onChange={(e) => updatePayeeRow(index, "value", e.target.value)}
                      placeholder={t("payeeValuePlaceholder")}
                      className="flex-1"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removePayeeRow(index)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
