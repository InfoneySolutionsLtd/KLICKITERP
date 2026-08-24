"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useSuppliers } from "@/features/procurement/hooks/use-suppliers";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { VOUCHER_METHODS, VOUCHER_PAYEE_TYPES, type VoucherMethod, type VoucherPayeeType } from "@/features/expenses/hooks/use-vouchers";
import { useLogTransportExpense } from "../hooks/use-transport-expenses";

const CONTACT_MAX_LENGTH = 120;
const OTHER_NAME_MAX_LENGTH = 120;

/**
 * "Log Bus Expense" — the Transport Route detail page's own thin wrapper
 * around the real Expense Voucher create flow (`CreateVoucherDialog`,
 * `features/expenses/components/create-voucher-dialog.tsx`), NOT that exact
 * component reused verbatim: the real backend endpoint here
 * (`POST billing/transport-routes/{routeId}/expenses`,
 * `TransportExpenseService.logExpense()`) is a different one from the plain
 * `POST expenses/vouchers` that dialog calls — it creates the voucher AND
 * the `bill_transport_expense` link row in the same transaction, with the
 * category pinned server-side to the designated "Transport/Vehicle Expense"
 * row (no `categoryId` field on `LogTransportExpenseDto` at all — the caller
 * never picks one). So this is its own dialog, reusing the SAME payeeType
 * sub-form shape (`SUPPLIER`/`STAFF`/`OTHER`, the same 3 pickers
 * `CreateVoucherDialog` establishes) and the same `VOUCHER_METHODS`/
 * `VOUCHER_PAYEE_TYPES` constants + `expenses.vouchers.payeeTypes`/`.methods`
 * i18n labels, but wired to `useLogTransportExpense()` instead.
 *
 * On success, stays on the route detail page (closes the dialog) rather
 * than navigating to `/expenses/vouchers/{id}` the way `CreateVoucherDialog`
 * does — the caller wants to keep billing this route's expenses, not leave
 * the page; the new voucher shows up in the route's own expense list
 * immediately (query invalidated by `useLogTransportExpense`), each row
 * linking to `/expenses/vouchers/{id}` for the real submit/approve/pay
 * lifecycle.
 *
 * Field labels/placeholders (`payeeTypeLabel`, `supplierLabel`, `amountLabel`,
 * etc.) are deliberately sourced from `expenses.vouchers.createDialog`
 * directly — the exact same generic voucher-field vocabulary `CreateVoucherDialog`
 * itself uses, reused rather than re-translated a second time under a new
 * key. Only this dialog's own distinct copy (`trigger`/`title`/`description`/
 * `logging`/`logButton`/`genericError`) lives under its own
 * `billing.transportRoutes.expenses.logDialog` namespace.
 */
export function LogBusExpenseDialog({ routeId }: { routeId: string }) {
  const t = useTranslations("billing.transportRoutes.expenses.logDialog");
  const tField = useTranslations("expenses.vouchers.createDialog");
  const tPayeeTypes = useTranslations("expenses.vouchers.payeeTypes");
  const tMethods = useTranslations("expenses.vouchers.methods");
  const tCommon = useTranslations("common");

  const [open, setOpen] = React.useState(false);
  const [payeeType, setPayeeType] = React.useState<VoucherPayeeType>("SUPPLIER");
  const [supplierId, setSupplierId] = React.useState("");
  const [staffUserId, setStaffUserId] = React.useState("");
  const [otherName, setOtherName] = React.useState("");
  const [otherContact, setOtherContact] = React.useState("");
  const [amount, setAmount] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<VoucherMethod>("CASH");
  const [narrative, setNarrative] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const logMutation = useLogTransportExpense(routeId);
  const suppliersQuery = useSuppliers("ACTIVE", { enabled: open && payeeType === "SUPPLIER" });
  const usersQuery = useUsersLookup();

  function resetForm() {
    setPayeeType("SUPPLIER");
    setSupplierId("");
    setStaffUserId("");
    setOtherName("");
    setOtherContact("");
    setAmount(null);
    setMethod("CASH");
    setNarrative("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  function handlePayeeTypeChange(next: VoucherPayeeType) {
    setPayeeType(next);
    setSupplierId("");
    setStaffUserId("");
    setOtherName("");
    setOtherContact("");
  }

  const supplierItems = React.useMemo(() => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })), [suppliersQuery.data]);
  const staffItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    [usersQuery.data],
  );

  const payeeRefValid =
    (payeeType === "SUPPLIER" && !!supplierId) ||
    (payeeType === "STAFF" && !!staffUserId) ||
    (payeeType === "OTHER" && otherName.trim().length > 0);

  const canSubmit = payeeRefValid && !!amount && !!method && narrative.trim().length > 0 && !logMutation.isPending;

  function buildPayeeRef(): Record<string, unknown> {
    if (payeeType === "SUPPLIER") return { supplierId };
    if (payeeType === "STAFF") return { staffUserId };
    return { name: otherName.trim(), contact: otherContact.trim() };
  }

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    try {
      await logMutation.mutateAsync({
        payeeType,
        payeeRef: buildPayeeRef(),
        amount,
        method,
        narrative: narrative.trim(),
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="size-4" />
          {t("trigger")}
        </Button>
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{tField("payeeTypeLabel")}</Label>
            <Select value={payeeType} onValueChange={(v) => handlePayeeTypeChange(v as VoucherPayeeType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOUCHER_PAYEE_TYPES.map((pt) => (
                  <SelectItem key={pt} value={pt}>
                    {tPayeeTypes(pt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {payeeType === "SUPPLIER" && (
            <div className="space-y-1.5">
              <Label required>{tField("supplierLabel")}</Label>
              <Combobox
                items={supplierItems}
                value={supplierId}
                onChange={setSupplierId}
                placeholder={suppliersQuery.isLoading ? tField("loadingSuppliers") : tField("selectSupplierPlaceholder")}
                searchPlaceholder={tField("searchSuppliers")}
                emptyText={tField("noSuppliersFound")}
                disabled={suppliersQuery.isLoading}
              />
            </div>
          )}

          {payeeType === "STAFF" && (
            <div className="space-y-1.5">
              <Label required>{tField("staffLabel")}</Label>
              <Combobox
                items={staffItems}
                value={staffUserId}
                onChange={setStaffUserId}
                placeholder={usersQuery.isLoading ? tField("loadingUsers") : tField("selectStaffPlaceholder")}
                searchPlaceholder={tField("searchUsers")}
                emptyText={tField("noUsersFound")}
                disabled={usersQuery.isLoading}
              />
            </div>
          )}

          {payeeType === "OTHER" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label required>{tField("otherNameLabel")}</Label>
                <Input value={otherName} maxLength={OTHER_NAME_MAX_LENGTH} onChange={(e) => setOtherName(e.target.value)} placeholder={tField("otherNamePlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{tField("otherContactLabel")}</Label>
                <Input value={otherContact} maxLength={CONTACT_MAX_LENGTH} onChange={(e) => setOtherContact(e.target.value)} placeholder={tField("otherContactPlaceholder")} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{tField("amountLabel")}</Label>
              <MoneyInput value={amount ?? ""} onValueChange={setAmount} />
            </div>
            <div className="space-y-1.5">
              <Label required>{tField("methodLabel")}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as VoucherMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOUCHER_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {tMethods(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{tField("narrativeLabel")}</Label>
            <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder={tField("narrativePlaceholder")} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {logMutation.isPending ? t("logging") : t("logButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
