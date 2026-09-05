"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { useActiveClasses } from "@/features/students/hooks/use-classes";
import { findWalletByStudent, sweepToInvoices } from "@/features/wallet/api/wallets.api";
import { isInsufficientBalanceError, isTransferNeedsApprovalError } from "@/features/wallet/lib/errors";
import { applyStudentCredit } from "../api/student-credit.api";
import { getInvoice } from "../api/invoices.api";
import { AcademicYearTermSelect } from "./academic-year-term-select";
import { TransportStudentSelectionGrid } from "./transport-student-selection-grid";
import { useTransportRoutes } from "../hooks/use-transport-routes";
import { useBillTransportRoute } from "../hooks/use-transport-billing";

/**
 * Same wallet-sweep outcome vocabulary `bulk-generate-invoice-form.tsx`
 * already established — see that file's own `WalletOutcomeKind`/
 * `CreditBalanceOutcomeKind` doc comments for the full reasoning (this is a
 * deliberate own copy, not a shared type, matching this codebase's
 * per-screen duplication convention).
 */
type WalletOutcomeKind = "settled" | "partialShortfall" | "needsApproval" | "insufficientBalance" | "noWallet" | "failed";

interface WalletOutcome {
  studentId: string;
  invoiceId: string;
  amount: string;
  outcome: WalletOutcomeKind;
  message?: string;
  receiptId?: string;
}

type CreditBalanceOutcomeKind = "settled" | "partialShortfall" | "failed";

interface CreditBalanceOutcome {
  studentId: string;
  invoiceId: string;
  amount: string;
  outcome: CreditBalanceOutcomeKind;
  message?: string;
  receiptId?: string;
}

/** Same `sortInvoiceIdsByDueDate()` `sweepToInvoices()`/`applyStudentCredit()` requires — see `bulk-generate-invoice-form.tsx`'s own doc comment. */
async function sortInvoiceIdsByDueDate(invoiceIds: string[]): Promise<string[]> {
  const withDueDate = await Promise.all(invoiceIds.map(async (invoiceId) => ({ invoiceId, dueDate: (await getInvoice(invoiceId)).dueDate })));
  return withDueDate.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)).map((i) => i.invoiceId);
}

interface BillSummary {
  succeededStudents: number;
  succeededInvoices: number;
  failed: { studentId: string; error: string }[];
}

/**
 * The "Bill Transport" workflow's form: academic-year/term → grade → route
 * → a route-aware student picker (`<TransportStudentSelectionGrid>`,
 * pre-checked by each student's own `transportRouteId`) → the same two
 * wallet/credit-balance settlement checkboxes + collection orchestration
 * `bulk-generate-invoice-form.tsx` established, replicated locally per this
 * codebase's own duplication convention (see this file's own imports —
 * reuses only the lower-layer API functions, never that screen's
 * orchestration logic directly).
 */
export function BillTransportForm() {
  const t = useTranslations("billing.transportRoutes.billForm");
  const tCommon = useTranslations("common");
  const classesQuery = useActiveClasses();
  const routesQuery = useTransportRoutes();

  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [termId, setTermId] = React.useState<string | null>(null);
  const [classId, setClassId] = React.useState<string | null>(null);
  const [routeId, setRouteId] = React.useState<string | null>(null);
  const [studentIds, setStudentIds] = React.useState<string[]>([]);
  const [collectFromWallet, setCollectFromWallet] = React.useState(false);
  const [applyCreditBalance, setApplyCreditBalance] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<BillSummary | null>(null);
  const [walletOutcomes, setWalletOutcomes] = React.useState<WalletOutcome[] | null>(null);
  const [walletProcessing, setWalletProcessing] = React.useState(false);
  const [creditBalanceOutcomes, setCreditBalanceOutcomes] = React.useState<CreditBalanceOutcome[] | null>(null);
  const [creditBalanceProcessing, setCreditBalanceProcessing] = React.useState(false);

  const billMutation = useBillTransportRoute();

  const activeRoutes = React.useMemo(() => (routesQuery.data ?? []).filter((r) => r.isActive), [routesQuery.data]);
  const selectedRoute = React.useMemo(() => activeRoutes.find((r) => r.id === routeId) ?? null, [activeRoutes, routeId]);

  // A different class or route means a different student population — stale selections must not silently carry over.
  React.useEffect(() => {
    setStudentIds([]);
  }, [classId, routeId]);

  const submitting = billMutation.isPending || walletProcessing || creditBalanceProcessing;

  async function handleSubmit() {
    setError(null);
    setSummary(null);
    setWalletOutcomes(null);
    setCreditBalanceOutcomes(null);

    if (!termId) {
      setError(t("termRequired"));
      return;
    }
    if (!classId) {
      setError(t("classRequired"));
      return;
    }
    if (!routeId) {
      setError(t("routeRequired"));
      return;
    }
    if (studentIds.length === 0) {
      setError(t("studentsRequired"));
      return;
    }

    let result;
    try {
      result = await billMutation.mutateAsync({ routeId, termId, studentIds });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
      return;
    }

    setSummary({
      succeededStudents: result.succeeded.length,
      succeededInvoices: result.succeeded.reduce((sum, s) => sum + s.invoiceIds.length, 0),
      failed: result.failed,
    });

    // Same ordering decision `bulk-generate-invoice-form.tsx` made: wallet
    // first, credit balance second, so credit balance only ever covers what
    // the wallet didn't already.
    if (collectFromWallet && result.succeeded.length > 0) {
      await runWalletCollection(result.succeeded);
    }
    if (applyCreditBalance && result.succeeded.length > 0) {
      await runCreditBalanceCollection(result.succeeded);
    }
  }

  async function runWalletCollection(succeeded: { studentId: string; invoiceIds: string[] }[]): Promise<void> {
    setWalletProcessing(true);
    const outcomes: WalletOutcome[] = [];
    const walletIdByStudent = new Map<string, string | null>();

    for (const student of succeeded) {
      let walletId = walletIdByStudent.get(student.studentId);
      if (walletId === undefined) {
        const wallet = await findWalletByStudent(student.studentId).catch(() => null);
        walletId = wallet?.id ?? null;
        walletIdByStudent.set(student.studentId, walletId);
      }

      if (!walletId) {
        for (const invoiceId of student.invoiceIds) {
          outcomes.push({ studentId: student.studentId, invoiceId, amount: "0.0000", outcome: "noWallet" });
        }
        continue;
      }

      try {
        const orderedInvoiceIds = await sortInvoiceIdsByDueDate(student.invoiceIds);
        const result = await sweepToInvoices(walletId, { invoiceIds: orderedInvoiceIds });

        for (const alloc of result.allocations) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
            outcome: "settled",
            receiptId: result.receiptId ?? undefined,
          });
        }
        for (const shortfall of result.shortfall) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: shortfall.invoiceId,
            amount: shortfall.remainingBalance,
            outcome: "partialShortfall",
          });
        }
      } catch (err) {
        if (isTransferNeedsApprovalError(err)) {
          for (const invoiceId of student.invoiceIds) {
            outcomes.push({ studentId: student.studentId, invoiceId, amount: "", outcome: "needsApproval" });
          }
        } else if (isInsufficientBalanceError(err)) {
          for (const invoiceId of student.invoiceIds) {
            outcomes.push({ studentId: student.studentId, invoiceId, amount: "", outcome: "insufficientBalance" });
          }
        } else {
          const message = err instanceof ApiError ? err.message : t("genericError");
          for (const invoiceId of student.invoiceIds) {
            outcomes.push({ studentId: student.studentId, invoiceId, amount: "", outcome: "failed", message });
          }
        }
      }
    }

    setWalletOutcomes(outcomes);
    setWalletProcessing(false);
  }

  async function runCreditBalanceCollection(succeeded: { studentId: string; invoiceIds: string[] }[]): Promise<void> {
    setCreditBalanceProcessing(true);
    const outcomes: CreditBalanceOutcome[] = [];

    for (const student of succeeded) {
      try {
        const orderedInvoiceIds = await sortInvoiceIdsByDueDate(student.invoiceIds);
        const result = await applyStudentCredit({ studentId: student.studentId, invoiceIds: orderedInvoiceIds });

        for (const alloc of result.allocations) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
            outcome: "settled",
            receiptId: result.receiptId ?? undefined,
          });
        }
        for (const shortfall of result.shortfall) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: shortfall.invoiceId,
            amount: shortfall.remainingBalance,
            outcome: "partialShortfall",
          });
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : t("genericError");
        for (const invoiceId of student.invoiceIds) {
          outcomes.push({ studentId: student.studentId, invoiceId, amount: "", outcome: "failed", message });
        }
      }
    }

    setCreditBalanceOutcomes(outcomes);
    setCreditBalanceProcessing(false);
  }

  const outcomeCount = (outcome: WalletOutcomeKind) => (walletOutcomes ?? []).filter((o) => o.outcome === outcome).length;
  const creditOutcomeCount = (outcome: CreditBalanceOutcomeKind) => (creditBalanceOutcomes ?? []).filter((o) => o.outcome === outcome).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("formTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label required>{t("academicYearTerm")}</Label>
            <AcademicYearTermSelect
              academicYearId={academicYearId}
              termId={termId}
              onAcademicYearChange={setAcademicYearId}
              onTermChange={setTermId}
              yearPlaceholder={t("selectYear")}
              termPlaceholder={t("selectTerm")}
              autoSelectCurrent
            />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("class")}</Label>
            <Select value={classId ?? ""} onValueChange={setClassId} disabled={classesQuery.isLoading}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder={t("selectClass")} />
              </SelectTrigger>
              <SelectContent searchable searchPlaceholder={tCommon("search")}>
                {classesQuery.data?.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("route")}</Label>
            <Select value={routeId ?? ""} onValueChange={setRouteId} disabled={routesQuery.isLoading}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder={t("selectRoute")} />
              </SelectTrigger>
              <SelectContent searchable searchPlaceholder={tCommon("search")}>
                {activeRoutes.map((route) => (
                  <SelectItem key={route.id} value={route.id}>
                    {route.name} ({formatMoney(route.amount)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRoute && <p className="text-xs text-muted-foreground">{t("routeAmountHint", { amount: formatMoney(selectedRoute.amount) })}</p>}
          </div>

          <div className="space-y-1.5">
            <Label required>{t("students")}</Label>
            <TransportStudentSelectionGrid classId={classId} routeId={routeId} selected={studentIds} onChange={setStudentIds} />
          </div>

          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={collectFromWallet} onChange={(e) => setCollectFromWallet(e.target.checked)} />
              {t("collectFromWallet")}
            </label>
            {collectFromWallet && <p className="pl-6 text-xs text-muted-foreground">{t("collectFromWalletNotice")}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={applyCreditBalance} onChange={(e) => setApplyCreditBalance(e.target.checked)} />
              {t("applyCreditBalance")}
            </label>
            {applyCreditBalance && <p className="pl-6 text-xs text-muted-foreground">{t("applyCreditBalanceNotice")}</p>}
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {billMutation.isPending
                ? t("generating")
                : walletProcessing
                  ? t("collecting")
                  : creditBalanceProcessing
                    ? t("applyingCredit")
                    : t("submit")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("resultTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant={summary.failed.length > 0 ? "warning" : "success"}>
              <AlertDescription>
                {t("resultSucceeded", { students: summary.succeededStudents, invoices: summary.succeededInvoices })}
              </AlertDescription>
            </Alert>

            {summary.failed.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">{t("resultFailedTitle")}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {summary.failed.map((f) => (
                    <li key={f.studentId}>
                      {f.studentId}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {walletOutcomes && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">{t("walletResultTitle")}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>{t("walletSettled", { count: outcomeCount("settled") })}</span>
                  <span>{t("walletPartialShortfall", { count: outcomeCount("partialShortfall") })}</span>
                  <span>{t("walletNeedsApproval", { count: outcomeCount("needsApproval") })}</span>
                  <span>{t("walletInsufficientBalance", { count: outcomeCount("insufficientBalance") })}</span>
                  <span>{t("walletNoWallet", { count: outcomeCount("noWallet") })}</span>
                  <span>{t("walletFailed", { count: outcomeCount("failed") })}</span>
                </div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {walletOutcomes.map((o) => (
                    <li key={`${o.invoiceId}-${o.outcome}`}>
                      {o.studentId.slice(0, 8)}… / {o.invoiceId.slice(0, 8)}…: {t(`walletOutcome.${o.outcome}`, { amount: formatMoney(o.amount || "0.0000") })}
                      {o.message ? ` — ${o.message}` : ""}
                      {o.outcome === "settled" && o.receiptId && (
                        <>
                          {" "}
                          <Link href={`/payments/receipts/${o.receiptId}`} className="text-primary underline">
                            {t("viewReceiptLink")}
                          </Link>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {creditBalanceOutcomes && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">{t("creditBalanceResultTitle")}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>{t("creditBalanceSettled", { count: creditOutcomeCount("settled") })}</span>
                  <span>{t("creditBalancePartialShortfall", { count: creditOutcomeCount("partialShortfall") })}</span>
                  <span>{t("creditBalanceFailed", { count: creditOutcomeCount("failed") })}</span>
                </div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {creditBalanceOutcomes.map((o) => (
                    <li key={`${o.invoiceId}-${o.outcome}`}>
                      {o.studentId.slice(0, 8)}… / {o.invoiceId.slice(0, 8)}…: {t(`creditBalanceOutcome.${o.outcome}`, { amount: formatMoney(o.amount || "0.0000") })}
                      {o.message ? ` — ${o.message}` : ""}
                      {o.outcome === "settled" && o.receiptId && (
                        <>
                          {" "}
                          <Link href={`/payments/receipts/${o.receiptId}`} className="text-primary underline">
                            {t("viewReceiptLink")}
                          </Link>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
