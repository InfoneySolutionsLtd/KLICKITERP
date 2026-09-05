"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { BankExternalTransferResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useAccount as useBankAccount } from "@/features/banking/hooks/use-accounts";
import { isDraftPlaceholderNumber, useExternalTransfer } from "@/features/banking/hooks/use-external-transfers";
import { ExternalTransferStatusActions } from "@/features/banking/components/external-transfer-status-actions";
import { EditExternalTransferReferenceDialog } from "@/features/banking/components/edit-external-transfer-reference-dialog";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  POSTED: "success",
};

/**
 * P-35 (External Bank Transfer feature) — mirrors `banking/transfers/[id]/page.tsx`'s
 * exact shape: header Card (number/status/actions), a details grid, a
 * PERMANENT "how this posts" note (P-35's real 2-or-4-line journal — see
 * `BankExternalTransfersService.post()`'s own doc comment), a journal link
 * once posted. The from/to account grid is replaced with a source-account
 * button plus a beneficiary-details card, since there is no owned "to
 * account" here.
 */
export default function ExternalTransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("banking.externalTransfers.detail");
  const transferQuery = useExternalTransfer(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/banking/external-transfers">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={transferQuery}>{(transfer) => <ExternalTransferDetailCard transfer={transfer} />}</QueryBoundary>
    </div>
  );
}

function ExternalTransferDetailCard({ transfer }: { transfer: BankExternalTransferResponseDto }) {
  const t = useTranslations("banking.externalTransfers.detail");
  const tStatuses = useTranslations("banking.statuses");
  const router = useRouter();
  const sourceAccountQuery = useBankAccount(transfer.sourceAccountId);
  const sourceLabel = sourceAccountQuery.data ? sourceAccountQuery.data.name : transfer.sourceAccountId;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base text-foreground">{isDraftPlaceholderNumber(transfer.number) ? t("notYetPosted") : transfer.number}</CardTitle>
            <Badge variant={STATUS_BADGE_VARIANT[transfer.status] ?? "outline"}>{tStatuses(transfer.status)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("sourceAccountLabel")}</p>
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => router.push(`/banking/accounts/${transfer.sourceAccountId}`)}>
              {sourceLabel}
            </button>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("amountLabel")}</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(transfer.amount)}</p>
          </div>
          {transfer.feeAmount && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("feeAmountLabel")}</p>
              <p className="text-sm text-foreground">{formatMoney(transfer.feeAmount)}</p>
            </div>
          )}
        </div>

        <div className="rounded-md border border-border p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("beneficiaryDetailsTitle")}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">{t("beneficiaryNameLabel")}</p>
              <p className="text-sm text-foreground">{transfer.beneficiaryName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("beneficiaryBankNameLabel")}</p>
              <p className="text-sm text-foreground">{transfer.beneficiaryBankName}</p>
            </div>
            {transfer.beneficiaryBranch && (
              <div>
                <p className="text-xs text-muted-foreground">{t("beneficiaryBranchLabel")}</p>
                <p className="text-sm text-foreground">{transfer.beneficiaryBranch}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">{t("beneficiaryAccountNoLabel")}</p>
              <p className="text-sm text-foreground">{transfer.beneficiaryAccountNo}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {transfer.expectedClearingDate && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("expectedClearingDateLabel")}</p>
              <p className="text-sm text-foreground">{transfer.expectedClearingDate}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("referenceNoLabel")}</p>
            <div className="flex items-center gap-1">
              <p className="text-sm text-foreground">{transfer.referenceNo ?? t("referenceNoNotSet")}</p>
              <EditExternalTransferReferenceDialog transferId={transfer.id} currentValue={transfer.referenceNo} />
            </div>
          </div>
        </div>

        {transfer.journalId && (
          <p className="text-sm">
            <Link href={`/accounting/journals/${transfer.journalId}`} className="text-primary hover:underline">
              {t("viewJournal")}
            </Link>
          </p>
        )}

        <Alert>
          <AlertDescription>{t("howThisPostsNote")}</AlertDescription>
        </Alert>

        <ExternalTransferStatusActions transfer={transfer} />
      </CardContent>
    </Card>
  );
}
