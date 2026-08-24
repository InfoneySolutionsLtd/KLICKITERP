"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { InvoiceResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { InvoiceLinesTable } from "@/features/billing/components/invoice-lines-table";
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

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

const VOIDABLE_STATUSES = ["POSTED", "PARTIALLY_PAID", "PAID"];

function InvoiceDetail({ invoice }: { invoice: InvoiceResponseDto }) {
  const t = useTranslations("billing.invoices.detail");
  const tConcessions = useTranslations("billing.concessions");
  const linesQuery = useInvoiceLines(invoice.id);
  const creditNotesQuery = useCreditNotesByInvoice(invoice.id);
  const concessionsQuery = useConcessionsByInvoice(invoice.id);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1>
          <Link href={`/students/${invoice.studentId}`} className="text-sm text-primary hover:underline">
            {t("viewStudent")}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <InvoiceStatusBadge status={invoice.status} />
          {invoice.status === "DRAFT" && <PostInvoiceButton invoiceId={invoice.id} studentId={invoice.studentId} />}
          {VOIDABLE_STATUSES.includes(invoice.status) && <VoidInvoiceButton invoice={invoice} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("amountsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileRow label={t("subtotalLabel")} value={formatMoney(invoice.subtotal)} />
            <ProfileRow label={t("concessionTotalLabel")} value={formatMoney(invoice.concessionTotal)} />
            <ProfileRow label={t("totalLabel")} value={formatMoney(invoice.total)} />
            <ProfileRow label={t("paidAmountLabel")} value={formatMoney(invoice.paidAmount)} />
            <ProfileRow label={t("balanceLabel")} value={<span className="font-semibold">{formatMoney(invoice.balance)}</span>} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={linesQuery} isEmpty={(d) => d.length === 0}>
            {(lines) => <InvoiceLinesTable lines={lines} />}
          </QueryBoundary>
        </CardContent>
      </Card>

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
      <Card>
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
      <Card>
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
      {/* No standalone `/billing/invoices` list route exists in this slice
          (invoices are only ever reached from a student's Billing card or
          the fresh-generate redirect) — a plain history-back button avoids
          linking to a route that doesn't exist. */}
      <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="size-4" />
        {tCommon("back")}
      </Button>

      <QueryBoundary query={invoiceQuery}>{(invoice) => <InvoiceDetail invoice={invoice} />}</QueryBoundary>
    </div>
  );
}
