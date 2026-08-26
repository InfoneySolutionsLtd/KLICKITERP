"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { UploadCloud } from "lucide-react";
import type { InvoiceLineResponseDto, InvoiceResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { ACCOUNTING_SYNC_KINDS, type AccountingSyncKind } from "@/features/integrations/api/sync.api";
import { usePushInvoiceToAccounting } from "../hooks/use-invoices";

/**
 * Complete the Integrations area, Part 3.4 — `POST /integrations/sync/push`
 * worked but nothing in the app ever called it (`sync.api.ts`'s own doc
 * comment explains why no generic wrapper exists — the payload only makes
 * sense built from a real domain record by that record's own screen). This
 * is that screen's action. Follows `<PostInvoiceButton>`'s exact established
 * shape (one `useMutation` hook + `<Button>` + inline `<Alert>` result/
 * error — this codebase uses no toast library anywhere). Gated on
 * `integrations:sync:push` by the caller (only rendered for a real,
 * finalized invoice — see the invoice detail page).
 */
export function SyncInvoiceToAccountingButton({ invoice, lines }: { invoice: InvoiceResponseDto; lines: InvoiceLineResponseDto[] }) {
  const t = useTranslations("billing.invoices.detail");
  const [kind, setKind] = React.useState<AccountingSyncKind>("QUICKBOOKS");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ status: string; providerRef: string | null; error: string | null } | null>(null);
  const pushMutation = usePushInvoiceToAccounting();

  async function handlePush() {
    setError(null);
    setResult(null);
    try {
      const logRow = await pushMutation.mutateAsync({ invoice, lines, kind });
      setResult({ status: logRow.status, providerRef: logRow.providerRef, error: logRow.error });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as AccountingSyncKind)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNTING_SYNC_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => void handlePush()} disabled={pushMutation.isPending}>
          <UploadCloud className="size-4" />
          {pushMutation.isPending ? t("syncingToAccounting") : t("syncToAccountingAction")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert variant={result.status === "SUCCESS" ? "success" : "destructive"}>
          <AlertDescription>
            {result.status === "SUCCESS"
              ? t("syncToAccountingSuccess", { providerRef: result.providerRef ?? "" })
              : t("syncToAccountingFailed", { error: result.error ?? "" })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
