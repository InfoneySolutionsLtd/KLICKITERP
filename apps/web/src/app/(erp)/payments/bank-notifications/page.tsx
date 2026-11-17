"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { BankIpnResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type ServerPaginationState } from "@/components/patterns/data-table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatMoney } from "@/lib/money";
import { BankIpnStateBadge } from "@/features/payments/components/payment-status-badges";
import { useBankIpnList } from "@/features/payments/hooks/use-bank-ipn";
import type { BankIpnKind, BankIpnState } from "@/features/payments/api/bank-ipn.api";

const DEFAULT_PAGE_SIZE = 10;
const ALL = "__all__";
const STATES: BankIpnState[] = ["MATCHED", "SUSPENDED", "RECEIVED"];
const KINDS: BankIpnKind[] = ["ACCOUNT", "TILL"];
/** Only search once 2+ characters are typed — the same rule the Receipts list uses. */
const MIN_SEARCH_LENGTH = 2;

/**
 * Payment notifications the bank (KCB) has pushed to the ERP — newest first — and what became of each: receipted
 * (link to the receipt), or waiting in Suspense with the reason (link to resolve it). `payments:suspense:manage`,
 * the same permission as the suspense screen it feeds. Server-paginated.
 */
export default function BankNotificationsPage() {
  const t = useTranslations("payments.bankNotifications");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [state, setState] = React.useState<BankIpnState | null>(null);
  const [kind, setKind] = React.useState<BankIpnKind | null>(null);
  const [searchDraft, setSearchDraft] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchDraft, 300).trim();
  const q = debouncedSearch.length >= MIN_SEARCH_LENGTH ? debouncedSearch : undefined;

  const query = useBankIpnList({ page, pageSize, state: state ?? undefined, kind: kind ?? undefined, q });

  // A filter change is a genuinely different result set — page 1 is always valid.
  React.useEffect(() => {
    setPage(1);
  }, [state, kind, q]);

  const total = query.data?.total ?? 0;
  const serverPagination: ServerPaginationState = {
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };

  const columns = React.useMemo<ColumnDef<BankIpnResponseDto>[]>(
    () => [
      { accessorKey: "transactionAt", header: t("when"), cell: ({ row }) => new Date(row.original.transactionAt).toLocaleString() },
      { accessorKey: "kind", header: t("kind"), cell: ({ row }) => t(`kindValues.${row.original.kind}`) },
      { accessorKey: "externalRef", header: t("bankRef") },
      { accessorKey: "amount", header: t("amount"), cell: ({ row }) => formatMoney(row.original.amount) },
      {
        id: "payer",
        header: t("payer"),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div>{row.original.payerName ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {t("reference")}: {row.original.customerReference ?? "—"}
            </div>
          </div>
        ),
      },
      { accessorKey: "state", header: t("status"), cell: ({ row }) => <BankIpnStateBadge state={row.original.state} /> },
      {
        id: "outcome",
        header: t("outcome"),
        cell: ({ row }) => {
          const item = row.original;
          if (item.receiptId) {
            return (
              <Link href={`/payments/receipts/${item.receiptId}`} className="text-primary hover:underline">
                {t("viewReceipt")}
              </Link>
            );
          }
          if (item.suspenseItemId) {
            return (
              <div className="space-y-0.5">
                <Link href={`/payments/suspense/${item.suspenseItemId}`} className="text-primary hover:underline">
                  {t("resolveInSuspense")}
                </Link>
                {item.note && <div className="max-w-xs text-xs text-muted-foreground">{item.note}</div>}
              </div>
            );
          }
          return <span className="text-muted-foreground">{t("inProgress")}</span>;
        },
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payments">
          <ArrowLeft className="size-4" />
          {t("backToPayments")}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label>{t("search")}</Label>
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder={t("searchPlaceholder")} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("status")}</Label>
              <Select value={state ?? ALL} onValueChange={(v) => setState(v === ALL ? null : (v as BankIpnState))}>
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
                  {STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`stateValues.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("kind")}</Label>
              <Select value={kind ?? ALL} onValueChange={(v) => setKind(v === ALL ? null : (v as BankIpnKind))}>
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("allKinds")}</SelectItem>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`kindValues.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={query} isEmpty={(d) => d.items.length === 0}>
            {(data) => <DataTable columns={columns} data={data.items} serverPagination={serverPagination} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
