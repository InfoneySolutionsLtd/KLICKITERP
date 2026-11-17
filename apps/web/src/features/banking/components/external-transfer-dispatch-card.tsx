"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import type { BankExternalTransferResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { BANK_DISPATCH_ACTIVE_STATUSES, type BankExternalTransferDispatchResponseDto } from "../api/external-transfer-dispatch.api";
import { useDispatchTransfer, useResolveDispatch, useTransferDispatches } from "../hooks/use-external-transfer-dispatch";

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  PENDING: "soft-warning",
  SENT: "success",
  FAILED: "soft-destructive",
  UNKNOWN: "soft-warning",
};

/**
 * Actually sending an approved external transfer through the bank (KCB Funds Transfer). The ERP's own "post" only
 * records the payment in the books; this is the step that asks the bank to move the money — so it sits behind an
 * explicit confirmation, and the card shows every attempt with its 12-character bank reference.
 *
 * Shown only once the transfer is approved (or has attempts). An attempt whose outcome is UNKNOWN (the bank did not
 * answer, so it MAY have paid) blocks sending again until a person checks with the bank and resolves it here.
 */
export function ExternalTransferDispatchCard({ transfer }: { transfer: BankExternalTransferResponseDto }) {
  const t = useTranslations("banking.externalTransfers.dispatch");
  const attempts = useTransferDispatches(transfer.id);
  const rows = attempts.data ?? [];
  const live = rows.find((row) => (BANK_DISPATCH_ACTIVE_STATUSES as readonly string[]).includes(row.status));
  const eligible = transfer.status === "APPROVED" || transfer.status === "POSTED";
  const [sendOpen, setSendOpen] = React.useState(false);
  const [resolving, setResolving] = React.useState<BankExternalTransferDispatchResponseDto | null>(null);

  if (!eligible && rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        {eligible && (
          <Button type="button" size="sm" onClick={() => setSendOpen(true)} disabled={live !== undefined}>
            <Send className="size-4" />
            {t("sendButton")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("explain")}</p>

        {live?.status === "UNKNOWN" && (
          <Alert variant="warning">
            <AlertDescription>{t("unknownBanner", { reference: live.reference })}</AlertDescription>
          </Alert>
        )}
        {live?.status === "SENT" && (
          <Alert variant="success">
            <AlertDescription>{t("sentBanner", { reference: live.reference })}</AlertDescription>
          </Alert>
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{t(`statusValues.${row.status}`)}</Badge>
                    <span className="font-mono text-xs">{row.reference}</span>
                    <span className="text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>
                  </div>
                  <div>{formatMoney(row.amount)}</div>
                  {row.bankRef && (
                    <div className="text-xs text-muted-foreground">
                      {t("bankRef")}: {row.bankRef}
                    </div>
                  )}
                  {row.note && <div className="max-w-xl text-xs text-muted-foreground">{row.note}</div>}
                </div>
                {row.status === "UNKNOWN" && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setResolving(row)}>
                    {t("resolveButton")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <SendDialog transfer={transfer} open={sendOpen} onOpenChange={setSendOpen} />
      <ResolveDialog transferId={transfer.id} attempt={resolving} onClose={() => setResolving(null)} />
    </Card>
  );
}

function SendDialog({ transfer, open, onOpenChange }: { transfer: BankExternalTransferResponseDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("banking.externalTransfers.dispatch.sendDialog");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const mutation = useDispatchTransfer(transfer.id);
  const [understood, setUnderstood] = React.useState(false);
  const [transactionType, setTransactionType] = React.useState("");
  const [bankCode, setBankCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const tStatus = useTranslations("banking.externalTransfers.dispatch");

  React.useEffect(() => {
    if (open) {
      setUnderstood(false);
      setTransactionType("");
      setBankCode("");
      setError(null);
    }
  }, [open]);

  async function send() {
    setError(null);
    try {
      const result = await mutation.mutateAsync({
        ...(transactionType.trim() ? { transactionType: transactionType.trim() } : {}),
        ...(bankCode.trim() ? { beneficiaryBankCode: bankCode.trim() } : {}),
      });
      // The request itself worked; what the BANK did is in `status`.
      if (result.status === "SENT") toast.success(tStatus("toast.sent", { reference: result.reference }));
      else if (result.status === "FAILED") toast.error(result.note ?? tStatus("toast.failed"));
      else toast.warning(tStatus("toast.unknown", { reference: result.reference }), { durationMs: 0 });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
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

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border p-3 text-sm">
          <dt className="text-muted-foreground">{t("amount")}</dt>
          <dd className="font-semibold">{formatMoney(transfer.amount)}</dd>
          <dt className="text-muted-foreground">{t("beneficiary")}</dt>
          <dd>{transfer.beneficiaryName}</dd>
          <dt className="text-muted-foreground">{t("beneficiaryAccount")}</dt>
          <dd>
            {transfer.beneficiaryAccountNo} · {transfer.beneficiaryBankName}
          </dd>
        </dl>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("transactionType")}</Label>
            <Input value={transactionType} onChange={(e) => setTransactionType(e.target.value)} maxLength={2} placeholder={t("transactionTypePlaceholder")} disabled={mutation.isPending} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("beneficiaryBankCode")}</Label>
            <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} maxLength={20} placeholder={t("beneficiaryBankCodePlaceholder")} disabled={mutation.isPending} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("optionalHint")}</p>

        <Alert variant="warning">
          <AlertDescription>{t("realMoneyWarning")}</AlertDescription>
        </Alert>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 rounded border-input" disabled={mutation.isPending} />
          {t("understood")}
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void send()} disabled={!understood || mutation.isPending}>
            {mutation.isPending ? t("sending") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ transferId, attempt, onClose }: { transferId: string; attempt: BankExternalTransferDispatchResponseDto | null; onClose: () => void }) {
  const t = useTranslations("banking.externalTransfers.dispatch.resolveDialog");
  const tCommon = useTranslations("common");
  const mutation = useResolveDispatch(transferId);
  const [outcome, setOutcome] = React.useState<"SENT" | "FAILED">("FAILED");
  const [note, setNote] = React.useState("");
  const [bankRef, setBankRef] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (attempt) {
      setOutcome("FAILED");
      setNote("");
      setBankRef("");
      setError(null);
    }
  }, [attempt]);

  async function save() {
    if (!attempt) return;
    setError(null);
    try {
      await mutation.mutateAsync({ dispatchId: attempt.id, body: { outcome, note: note.trim(), ...(bankRef.trim() ? { bankRef: bankRef.trim() } : {}) } });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={attempt !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { reference: attempt?.reference ?? "" })}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("outcome")}</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as "SENT" | "FAILED")} disabled={mutation.isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FAILED">{t("outcomeFailed")}</SelectItem>
                <SelectItem value="SENT">{t("outcomeSent")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{outcome === "FAILED" ? t("outcomeFailedHint") : t("outcomeSentHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("note")}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder={t("notePlaceholder")} disabled={mutation.isPending} />
          </div>
          {outcome === "SENT" && (
            <div className="space-y-1.5">
              <Label>{t("bankRef")}</Label>
              <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} maxLength={60} disabled={mutation.isPending} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!note.trim() || mutation.isPending}>
            {mutation.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
