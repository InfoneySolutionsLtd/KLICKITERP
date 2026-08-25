"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Percent, Printer, Receipt } from "lucide-react";
import type { InvoiceResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { InvoicePrintDocument } from "@/features/billing/components/invoice-print-document";
import { InvoiceStatusBadge } from "@/features/billing/components/status-badges";
import { PostInvoiceButton } from "@/features/billing/components/post-invoice-button";
import { VoidInvoiceButton } from "@/features/billing/components/void-invoice-button";
import { useInvoice, useInvoiceLines } from "@/features/billing/hooks/use-invoices";
import { CreateCreditNoteDialog } from "@/features/billing/components/create-credit-note-dialog";
import { CreditNotesTable } from "@/features/billing/components/credit-notes-table";
import { useCreditNotesByInvoice } from "@/features/billing/hooks/use-credit-notes";
import { RequestConcessionDialog } from "@/features/billing/components/request-concession-dialog";
import { ConcessionsTable } from "@/features/billing/components/concessions-table";
import { useConcessionsByInvoice } from "@/features/billing/hooks/use-concessions";
import { PrintWatermark } from "@/features/document-verification/components/print-watermark";

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

const VOIDABLE_STATUSES = ["POSTED", "PARTIALLY_PAID", "PAID"];
/** Not DRAFT/VOID and a real remaining balance — the same set of conditions a "collect against this invoice" action should ever be offered for. `"0.0000"` is the exact 4dp decimal-string zero every `Money.toDecimalString()` value on this page is guaranteed to serialize as (never `"0"`/`"0.00"`), so a plain string comparison is safe here, no `Number()`/`parseFloat` needed. */
const COLLECTIBLE_STATUSES = ["POSTED", "PARTIALLY_PAID"];

function InvoiceDetail({ invoice }: { invoice: InvoiceResponseDto }) {
  const t = useTranslations("billing.invoices.detail");
  const tConcessions = useTranslations("billing.concessions");
  const linesQuery = useInvoiceLines(invoice.id);
  const creditNotesQuery = useCreditNotesByInvoice(invoice.id);
  const concessionsQuery = useConcessionsByInvoice(invoice.id);

  const isCollectible = COLLECTIBLE_STATUSES.includes(invoice.status) && invoice.balance !== "0.0000";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1>
          <Link href={`/students/${invoice.studentId}`} className="text-sm text-primary hover:underline print:hidden">
            {t("viewStudent")}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <InvoiceStatusBadge status={invoice.status} />
          {invoice.status === "DRAFT" && <PostInvoiceButton invoiceId={invoice.id} studentId={invoice.studentId} />}
          {VOIDABLE_STATUSES.includes(invoice.status) && <VoidInvoiceButton invoice={invoice} />}
        </div>
      </div>

      {/* Print-style document + its own action row (Print/Add Discount/Collect
          Fee) — the user's explicit "view the fee categories that make up an
          invoice" ask, modeled on their own reference screenshot. Add
          Discount reuses the SAME approval-gated Concession workflow the
          Concessions section below already offers (`defaultKind="DISCOUNT"`,
          a distinct trigger) — it does not change the balance instantly. */}
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          {t("printAction")}
        </Button>
        {invoice.status !== "VOID" && (
          <RequestConcessionDialog
            studentId={invoice.studentId}
            invoiceId={invoice.id}
            defaultKind="DISCOUNT"
            trigger={
              <Button type="button" variant="outline" size="sm">
                <Percent className="size-4" />
                {t("addDiscountAction")}
              </Button>
            }
          />
        )}
        {isCollectible && (
          <Button asChild size="sm">
            <Link href={`/billing/collect?studentId=${invoice.studentId}&invoiceId=${invoice.id}`}>
              <Receipt className="size-4" />
              {t("collectFeeAction")}
            </Link>
          </Button>
        )}
      </div>

      <div className="relative space-y-6">
        <PrintWatermark />

        <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
          {(lines) => <InvoicePrintDocument invoice={invoice} lines={lines} />}
        </QueryBoundary>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("summaryTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileRow label={t("statusLabel")} value={<InvoiceStatusBadge status={invoice.status} />} />
            <ProfileRow label={t("sourceLabel")} value={invoice.source} />
            <ProfileRow label={t("issueDateLabel")} value={invoice.issueDate} />
            <ProfileRow label={t("dueDateLabel")} value={invoice.dueDate} />
          </CardContent>
        </Card>
      </div>

      {/* Phase 6 Slice 22 Part 5 (Credit Notes) — the concrete answer to
          `VoidInvoiceButton`'s own "Use a credit note instead" hint, shown
          above once `paidAmount>0` blocks the Void button
          (`void-invoice-button.tsx`'s `blockedHint` copy): a credit note is
          how a POSTED invoice that already has payment applied gets
          corrected instead of voided. `CreditNotesService.create()` only
          accepts a POSTED/PARTIALLY_PAID/PAID target invoice (BR-BILL-09),
          the same status set `VOIDABLE_STATUSES` above already tracks, so
          the "New Credit Note" trigger reuses it rather than duplicating the
          condition. */}
      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base text-foreground">{t("creditNotesTitle")}</CardTitle>
          {VOIDABLE_STATUSES.includes(invoice.status) && <CreateCreditNoteDialog invoiceId={invoice.id} />}
        </CardHeader>
        <CardContent>
          <QueryBoundary query={creditNotesQuery} isEmpty={(d) => d.length === 0}>
            {(notes) => <CreditNotesTable notes={notes} invoiceId={invoice.id} studentId={invoice.studentId} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      {/* Part 4 (Billing sub-features batch) — Concessions, same
          CardHeader/CardTitle/CardContent + header-action-dialog shape the
          Credit Notes section above already uses. `RequestConcessionDialog`
          is shown for any non-VOID invoice status — unlike Credit Notes,
          `ConcessionsService.requestConcession()` doesn't require the target
          invoice to already be POSTED/PARTIALLY_PAID/PAID: a concession
          requested against a still-DRAFT invoice is a real, supported flow
          that folds into that invoice's own upcoming post once approved
          (see the informational note below), it just can't be POSTED
          STANDALONE until the invoice itself has posted
          (`PostStandaloneConcessionButton`'s own gate, rendered per row via
          `<ConcessionsTable invoice={invoice} />` below). */}
      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base text-foreground">{t("concessionsTitle")}</CardTitle>
          {invoice.status !== "VOID" && <RequestConcessionDialog studentId={invoice.studentId} invoiceId={invoice.id} />}
        </CardHeader>
        <CardContent className="space-y-4">
          {invoice.status === "DRAFT" && (
            <Alert>
              <AlertDescription>{tConcessions("autoFoldNote")}</AlertDescription>
            </Alert>
          )}
          <QueryBoundary query={concessionsQuery} isEmpty={(d) => d.length === 0}>
            {(concessions) => <ConcessionsTable concessions={concessions} studentId={invoice.studentId} invoice={invoice} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tCommon = useTranslations("common");
  const router = useRouter();
  const invoiceQuery = useInvoice(id);

  return (
    <div className="space-y-6">
      {/* No standalone `/billing/invoices` list route exists — this page is
          reached from a student's Billing card, the fresh-generate redirect,
          or (Invoice/Receipt "View" pass) the Pending/Upcoming Invoices
          lists' own new View button — a plain history-back button correctly
          returns to whichever of those the user actually came from, rather
          than hardcoding one specific parent route. */}
      <Button type="button" variant="ghost" size="sm" className="print:hidden" onClick={() => router.back()}>
        <ArrowLeft className="size-4" />
        {tCommon("back")}
      </Button>

      <QueryBoundary query={invoiceQuery}>{(invoice) => <InvoiceDetail invoice={invoice} />}</QueryBoundary>
    </div>
  );
}
