"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateBankExternalTransferDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import { GlAccountSelect } from "@/features/billing/components/gl-account-select";
import { useCreateExternalTransfer } from "../hooks/use-external-transfers";

/**
 * P-35 (External Bank Transfer feature) — mirrors `create-transfer-dialog.tsx`'s
 * exact shape, swapping the "to account" combobox for a beneficiary-details
 * sub-form (name/bank/branch/account no, all free text — the school has no
 * record of this account) plus a `<GlAccountSelect accountClass="EXPENSE">`
 * picker for `debitAccountId` (what this payment is for — same
 * creator-picked-account pattern `ConcessionSchemeDialog` already
 * establishes for its own `glAccountId`, cross-imported here the same way
 * `wallet/components/service-point-dialog.tsx` already does).
 */
export function CreateExternalTransferDialog() {
  const t = useTranslations("banking.externalTransfers.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [sourceAccountId, setSourceAccountId] = React.useState("");
  const [beneficiaryName, setBeneficiaryName] = React.useState("");
  const [beneficiaryBankName, setBeneficiaryBankName] = React.useState("");
  const [beneficiaryBranch, setBeneficiaryBranch] = React.useState("");
  const [beneficiaryAccountNo, setBeneficiaryAccountNo] = React.useState("");
  const [debitAccountId, setDebitAccountId] = React.useState("");
  const [amount, setAmount] = React.useState<string | null>(null);
  const [feeAmount, setFeeAmount] = React.useState<string | null>(null);
  const [referenceNo, setReferenceNo] = React.useState("");
  const [expectedClearingDate, setExpectedClearingDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateExternalTransfer();
  const accountsQuery = useBankAccounts({ isActive: true });

  function resetForm() {
    setSourceAccountId("");
    setBeneficiaryName("");
    setBeneficiaryBankName("");
    setBeneficiaryBranch("");
    setBeneficiaryAccountNo("");
    setDebitAccountId("");
    setAmount(null);
    setFeeAmount(null);
    setReferenceNo("");
    setExpectedClearingDate("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const sourceAccountItems = React.useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.id, label: a.bankName ? `${a.name} — ${a.bankName}` : a.name })),
    [accountsQuery.data],
  );

  const canSubmit =
    !!sourceAccountId &&
    !!beneficiaryName.trim() &&
    !!beneficiaryBankName.trim() &&
    !!beneficiaryAccountNo.trim() &&
    !!debitAccountId &&
    !!amount &&
    !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    const dto: CreateBankExternalTransferDto = {
      sourceAccountId,
      beneficiaryName: beneficiaryName.trim(),
      beneficiaryBankName: beneficiaryBankName.trim(),
      beneficiaryBranch: beneficiaryBranch.trim() || undefined,
      beneficiaryAccountNo: beneficiaryAccountNo.trim(),
      debitAccountId,
      amount,
      feeAmount: feeAmount ?? undefined,
      referenceNo: referenceNo.trim() || undefined,
      expectedClearingDate: expectedClearingDate || undefined,
    };
    try {
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/banking/external-transfers/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          {t("trigger")}
        </Button>
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("sourceAccountLabel")}</Label>
            <Combobox
              items={sourceAccountItems}
              value={sourceAccountId}
              onChange={setSourceAccountId}
              placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccountPlaceholder")}
              searchPlaceholder={t("searchAccounts")}
              emptyText={t("noAccountsFound")}
              disabled={accountsQuery.isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("beneficiaryNameLabel")}</Label>
            <Input value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} maxLength={120} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("beneficiaryBankNameLabel")}</Label>
              <Input value={beneficiaryBankName} onChange={(e) => setBeneficiaryBankName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("beneficiaryBranchLabel")}</Label>
              <Input value={beneficiaryBranch} onChange={(e) => setBeneficiaryBranch(e.target.value)} maxLength={120} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("beneficiaryAccountNoLabel")}</Label>
            <Input value={beneficiaryAccountNo} onChange={(e) => setBeneficiaryAccountNo(e.target.value)} maxLength={40} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("debitAccountLabel")}</Label>
            <GlAccountSelect value={debitAccountId} onChange={setDebitAccountId} accountClass="EXPENSE" />
            <p className="text-xs text-muted-foreground">{t("debitAccountHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("amountLabel")}</Label>
            <MoneyInput value={amount ?? ""} onValueChange={setAmount} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("feeAmountLabel")}</Label>
            <MoneyInput value={feeAmount ?? ""} onValueChange={setFeeAmount} />
            <p className="text-xs text-muted-foreground">{t("feeAmountHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("referenceNoLabel")}</Label>
            <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} maxLength={60} />
            <p className="text-xs text-muted-foreground">{t("referenceNoHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("expectedClearingDateLabel")}</Label>
            <Input type="date" value={expectedClearingDate} onChange={(e) => setExpectedClearingDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("expectedClearingDateHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
