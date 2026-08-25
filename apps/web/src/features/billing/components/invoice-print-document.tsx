"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { InvoiceLineResponseDto, InvoiceResponseDto } from "@klickit/contracts";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { amountInWords } from "@/lib/money-words";
import { useStudent } from "@/features/students/hooks/use-students";
import { useClasses } from "@/features/students/hooks/use-classes";
import { useStreamsForClass } from "@/features/students/hooks/use-streams";
import { useCurrentTheme } from "@/features/document-verification/hooks/use-current-theme";
import { useAcademicYears, useAllTerms } from "../hooks/use-academic-calendar";
import { useFeeCategories } from "../hooks/use-fee-categories";

function IdentityField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}:</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function AmountRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${emphasis ? "border-t border-border pt-1 font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className={emphasis ? "text-foreground" : undefined}>{formatMoney(value)}</span>
    </div>
  );
}

/**
 * The invoice print view's own document — school header (logo +
 * `documentConfig.headerText`, via `useCurrentTheme()`, the same client-side
 * theme source `<PrintWatermark>` already established), student/invoice
 * identity, a particulars table of real fee-category lines, and an amounts
 * breakdown ending in a "balance in words" line — modeled directly on the
 * user's own reference screenshot. Replaces the old separate "Amounts" +
 * "Lines" cards on `billing/invoices/[id]/page.tsx` with one cohesive
 * document, shown on-screen (not print-only) and rendered as-is when
 * printed (`print:border-0 print:shadow-none`, same convention every other
 * print view in this codebase uses).
 *
 * No `academicYear`/`division` fields exist directly on `InvoiceResponseDto`
 * — resolved the same way every other screen in this app resolves them:
 * `invoice.termId` -> `useAllTerms()` -> that term's own `academicYearId` ->
 * `useAcademicYears()`; the student's own `classId`/`streamId` -> `useClasses()`/
 * `useStreamsForClass()`. All read-only lookups already used elsewhere in
 * this codebase, no new endpoints.
 */
export function InvoicePrintDocument({ invoice, lines }: { invoice: InvoiceResponseDto; lines: InvoiceLineResponseDto[] }) {
  const t = useTranslations("billing.invoices.printDocument");

  const themeQuery = useCurrentTheme();
  const studentQuery = useStudent(invoice.studentId);
  const classesQuery = useClasses();
  const termsQuery = useAllTerms();
  const yearsQuery = useAcademicYears();
  const categoriesQuery = useFeeCategories();
  const student = studentQuery.data;
  const streamsQuery = useStreamsForClass(student?.classId);

  const theme = themeQuery.data;
  const className = classesQuery.data?.find((c) => c.id === student?.classId)?.name ?? "—";
  const streamName = streamsQuery.data?.find((s) => s.id === student?.streamId)?.name ?? "—";
  const term = termsQuery.data?.find((tm) => tm.id === invoice.termId);
  const yearName = yearsQuery.data?.find((y) => y.id === term?.academicYearId)?.name ?? "—";
  const categoryNameById = React.useMemo(() => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])), [categoriesQuery.data]);

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardContent className="space-y-6 pt-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {theme?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a signed, expiring MinIO URL isn't a static asset next/image can profitably optimize/cache (same precedent as components/layout/sidebar.tsx's own logo <img>).
            <img src={theme.logoUrl} alt="" className="h-16 w-16 object-contain" />
          )}
          {theme?.documentConfig.headerText && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{theme.documentConfig.headerText}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-2 border-y border-border py-4 sm:grid-cols-3">
          <IdentityField label={t("admissionNo")} value={student?.admissionNo ?? "—"} />
          <IdentityField label={t("name")} value={student ? `${student.firstName} ${student.lastName}` : "—"} />
          <IdentityField label={t("grade")} value={className} />
          <IdentityField label={t("academicYear")} value={yearName} />
          <IdentityField label={t("division")} value={streamName} />
          <IdentityField label={t("issueDate")} value={invoice.issueDate} />
          <IdentityField label={t("dueDate")} value={invoice.dueDate} />
          <IdentityField label={t("invoiceNo")} value={invoice.number} />
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>{t("particulars")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={line.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <span className="font-medium text-foreground">{categoryNameById.get(line.feeCategoryId) ?? line.feeCategoryId}</span>
                    {line.description && <span className="text-muted-foreground"> — {line.description}</span>}
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(line.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="ml-auto max-w-xs space-y-1.5 text-sm">
          <AmountRow label={t("subTotal")} value={invoice.subtotal} />
          <AmountRow label={t("discount")} value={invoice.concessionTotal} />
          <AmountRow label={t("grandTotal")} value={invoice.total} emphasis />
          <AmountRow label={t("paidAmount")} value={invoice.paidAmount} />
          <AmountRow label={t("balance")} value={invoice.balance} emphasis />
        </div>

        <p className="text-xs italic text-muted-foreground">{t("balanceInWords", { words: amountInWords(invoice.balance) })}</p>
      </CardContent>
    </Card>
  );
}
