"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RowActionButton } from "@/components/ui/row-action-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { formatMoney } from "@/lib/money";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import {
  BANK_EXTERNAL_TRANSFER_STATUSES,
  isDraftPlaceholderNumber,
  useExternalTransfers,
  type BankExternalTransferResponseDto,
  type BankExternalTransferStatus,
} from "@/features/banking/hooks/use-external-transfers";
import { CreateExternalTransferDialog } from "@/features/banking/components/create-external-transfer-dialog";

const ALL_SENTINEL = "__all__";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  POSTED: "success",
};

/**
 * P-35 (External Bank Transfer feature) — mirrors `banking/transfers/page.tsx`'s
 * exact shape: Card + status/source-account `<Select>` filters (real
 * server-side query params) + `<DataTable>` inside `<QueryBoundary>`, row
 * click navigates to `/banking/external-transfers/[id]`.
 * `banking:external-transfer:create`-gated server-side.
 */
export default function ExternalTransfersPage() {
  const t = useTranslations("banking.externalTransfers.list");
  const tCommon = useTranslations("common");
  const tStatuses = useTranslations("banking.statuses");
  const router = useRouter();
  const [status, setStatus] = React.useState<BankExternalTransferStatus | "">("");
  const [sourceAccountId, setSourceAccountId] = React.useState("");

  const transfersQuery = useExternalTransfers({ ...(status ? { status } : {}), ...(sourceAccountId ? { sourceAccountId } : {}) });
  const accountsQuery = useBankAccounts({ isActive: true });

  const accountNameById = React.useMemo(() => new Map((accountsQuery.data ?? []).map((a) => [a.id, a.name])), [accountsQuery.data]);

  const columns = React.useMemo<ColumnDef<BankExternalTransferResponseDto>[]>(
    () => [
      { id: "number", header: t("columns.number"), cell: ({ row }) => (isDraftPlaceholderNumber(row.original.number) ? t("notYetPosted") : row.original.number) },
      { id: "sourceAccount", header: t("columns.sourceAccount"), cell: ({ row }) => accountNameById.get(row.original.sourceAccountId) ?? row.original.sourceAccountId },
      { id: "beneficiaryName", header: t("columns.beneficiaryName"), cell: ({ row }) => row.original.beneficiaryName },
      { id: "amount", header: t("columns.amount"), cell: ({ row }) => formatMoney(row.original.amount) },
      {
        id: "status",
        header: t("columns.status"),
        cell: ({ row }) => <Badge variant={STATUS_BADGE_VARIANT[row.original.status] ?? "outline"}>{tStatuses(row.original.status)}</Badge>,
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <RowActionButton
            tone="view"
            label={tCommon("view")}
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/banking/external-transfers/${row.original.id}`);
            }}
          >
            <Eye />
          </RowActionButton>
        ),
      },
    ],
    [t, tStatuses, accountNameById, tCommon, router],
  );

  const hasActiveFilters = !!(status || sourceAccountId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateExternalTransferDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-52 space-y-1.5">
              <Label>{t("filters.statusLabel")}</Label>
              <Select value={status || ALL_SENTINEL} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : (v as BankExternalTransferStatus))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allStatuses")}</SelectItem>
                  {BANK_EXTERNAL_TRANSFER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStatuses(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-56 space-y-1.5">
              <Label>{t("filters.sourceAccountLabel")}</Label>
              <Select value={sourceAccountId || ALL_SENTINEL} onValueChange={(v) => setSourceAccountId(v === ALL_SENTINEL ? "" : v)} disabled={accountsQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={t("filters.allAccounts")} />
                </SelectTrigger>
                <SelectContent searchable searchPlaceholder={tCommon("search")}>
                  <SelectItem value={ALL_SENTINEL}>{t("filters.allAccounts")}</SelectItem>
                  {(accountsQuery.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus("");
                  setSourceAccountId("");
                }}
              >
                <X className="size-4" />
                {t("filters.clearFilters")}
              </Button>
            )}
          </div>

          <QueryBoundary query={transfersQuery} isEmpty={(d) => d.length === 0}>
            {(transfers) => <DataTable columns={columns} data={transfers} onRowClick={(tr) => router.push(`/banking/external-transfers/${tr.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
