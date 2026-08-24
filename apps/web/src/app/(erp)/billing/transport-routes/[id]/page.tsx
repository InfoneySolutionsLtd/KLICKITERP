"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Receipt } from "lucide-react";
import type { TransportRouteResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import {
  useActivateTransportRoute,
  useDeactivateTransportRoute,
  useTransportRoute,
} from "@/features/billing/hooks/use-transport-routes";
import { useTransportExpenses, useTransportRouteSummary } from "@/features/billing/hooks/use-transport-expenses";
import { TransportRouteDialog } from "@/features/billing/components/transport-route-dialog";
import { LogBusExpenseDialog } from "@/features/billing/components/log-bus-expense-dialog";

const EXPENSE_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  PAID: "success",
  CANCELLED: "soft-destructive",
};

/**
 * Part 1 (Billing sub-features batch) — a transport route's detail page:
 * header (name, status badge, Edit + Activate/Deactivate) and a details grid
 * (amount, bus). Extended by the Transport Routes enhancement with two new
 * sections: **Bus Expenses** (a scoped list of real `exp_voucher` rows
 * linked to this route via `bill_transport_expense`, each linking to
 * `/expenses/vouchers/{id}` for the real submit/approve/pay lifecycle — this
 * page never manages that lifecycle itself) and **Income vs Expense** (a
 * small summary card fed by `GET .../summary`: total billed transport fees
 * vs. total logged bus expenses for this route, so an admin can judge
 * whether a specific bus/route is worth what it costs).
 */
export default function TransportRouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("billing.transportRoutes.detail");
  const routeQuery = useTransportRoute(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/billing/transport-routes">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={routeQuery}>{(route) => <RouteDetailCard route={route} />}</QueryBoundary>
    </div>
  );
}

function RouteDetailCard({ route }: { route: TransportRouteResponseDto }) {
  const t = useTranslations("billing.transportRoutes.detail");
  const tCommon = useTranslations("common");
  const [editOpen, setEditOpen] = React.useState(false);
  const deactivateMutation = useDeactivateTransportRoute();
  const activateMutation = useActivateTransportRoute();

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          {t("billTransportHint")}{" "}
          <Link href="/billing/transport-routes/bill" className="font-medium underline">
            {t("billTransportLink")}
          </Link>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{route.name}</CardTitle>
              <Badge variant={route.isActive ? "soft-success" : "soft-destructive"}>
                {route.isActive ? tCommon("active") : tCommon("inactive")}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              {tCommon("edit")}
            </Button>
            {route.isActive ? (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-tint-destructive hover:text-destructive"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(route.id)}
              >
                {t("deactivate")}
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={activateMutation.isPending} onClick={() => activateMutation.mutate(route.id)}>
                {t("activate")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("amountLabel")}</p>
              <p className="text-sm text-foreground">{route.amount}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("busLabel")}</p>
              <p className="text-sm text-foreground">{route.bus ?? t("busNotSet")}</p>
            </div>
          </div>
        </CardContent>

        <TransportRouteDialog mode="edit" route={route} open={editOpen} onOpenChange={setEditOpen} />
      </Card>

      <RouteSummaryCard routeId={route.id} />
      <RouteExpensesCard routeId={route.id} />
    </div>
  );
}

function RouteSummaryCard({ routeId }: { routeId: string }) {
  const t = useTranslations("billing.transportRoutes.summary");
  const summaryQuery = useTransportRouteSummary(routeId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryBoundary query={summaryQuery}>
          {(summary) => {
            const income = Number(summary.totalIncome);
            const expense = Number(summary.totalExpense);
            const net = income - expense;
            return (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("income")}</p>
                  <p className="text-sm text-foreground">{formatMoney(summary.totalIncome)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("expense")}</p>
                  <p className="text-sm text-foreground">{formatMoney(summary.totalExpense)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("net")}</p>
                  <p className={`text-sm font-medium ${net < 0 ? "text-destructive" : "text-foreground"}`}>{formatMoney(String(net))}</p>
                </div>
              </div>
            );
          }}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}

function RouteExpensesCard({ routeId }: { routeId: string }) {
  const t = useTranslations("billing.transportRoutes.expenses");
  const tStatuses = useTranslations("expenses.vouchers.statuses");
  const expensesQuery = useTransportExpenses(routeId);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <LogBusExpenseDialog routeId={routeId} />
      </CardHeader>
      <CardContent>
        <QueryBoundary query={expensesQuery} isEmpty={(d) => d.length === 0}>
          {(expenses) => (
            <ul className="divide-y divide-border">
              {expenses.map((expense) => (
                <li key={expense.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/expenses/vouchers/${expense.voucherId}`} className="font-medium text-primary underline">
                      {expense.voucherNumber}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{expense.narrative}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground">{formatMoney(expense.amount)}</span>
                    <Badge variant={EXPENSE_STATUS_BADGE_VARIANT[expense.status] ?? "outline"}>{tStatuses(expense.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
