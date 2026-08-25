"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { RequestConcessionDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { formatMoney, sumMoneyStrings } from "@/lib/money";
import { useStudentInvoices } from "../hooks/use-invoices";
import { useConcessionSchemes } from "../hooks/use-concession-schemes";
import { useSponsorAwardsForStudent } from "../hooks/use-sponsor-awards";
import { useSponsors } from "../hooks/use-sponsors";
import { useRequestConcession } from "../hooks/use-concessions";

const BILL_CONCESSION_KINDS = ["WAIVER", "DISCOUNT", "SCHOLARSHIP", "BURSARY"] as const;
type ConcessionKind = (typeof BILL_CONCESSION_KINDS)[number];

/** `RequestConcessionDto` requires `schemeId` XOR `sponsorAwardId` — see `ConcessionsService.requestConcession()`'s own validation. This toggle enforces that as a real UI constraint (only one field's picker is ever shown/submitted), not just a client-side hint. */
type TargetMode = "scheme" | "sponsorAward";

/** Invoices a student-scoped request can target — deliberately excludes DRAFT (would auto-fold at that invoice's own post instead, no concession request needed for that path yet) and PAID/VOID (nothing left to concede against). Matches the plan's own "posted/partially-paid invoices" scope decision. */
const TARGETABLE_INVOICE_STATUSES = ["POSTED", "PARTIALLY_PAID"] as const;

function negateDecimalString(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

/**
 * Part 4 (Billing sub-features batch) — `POST /billing/concessions`
 * (`ConcessionsController.request()`, permission `billing:concession:request`).
 * Same self-contained trigger+`useState`-per-field shape `SponsorAwardDialog`/
 * `ConcessionSchemeDialog` establish (create-only, no edit mode — the
 * backend has no update endpoint for a concession at all).
 *
 * Two real call sites, per the plan:
 *  - Invoice-scoped (`invoiceId` supplied): launched from the invoice detail
 *    page's own "Concessions" section — the target invoice is fixed by page
 *    context, never re-picked here.
 *  - Student-scoped (`invoiceId` omitted): launched from the student detail
 *    page's "Concessions" Card — `RequestConcessionDto` still requires
 *    exactly one of `invoiceId`/`invoiceLineId`, so this mode lets the user
 *    pick one of the student's own POSTED/PARTIALLY_PAID invoices via a
 *    combobox (`useStudentInvoices(studentId)`, already scoped to this
 *    student). Always submits `invoiceId`, never `invoiceLineId` — the
 *    simplest, defensible reading of the plan's own scope decision; a
 *    line-level picker is out of scope for this pass.
 *
 * The Scheme-vs-Sponsor-Award choice is a real mutually-exclusive UI
 * constraint (a two-button segmented toggle, same shape
 * `guardian-link-dialog.tsx`'s existing/new tab switcher uses — no
 * radio-group primitive exists in `components/ui/`), mirroring the server's
 * own `schemeId` XOR `sponsorAwardId` validation
 * (`ConcessionsService.requestConcession()`) rather than just hinting at it:
 * only the active mode's field is ever populated or submitted.
 *
 * `defaultKind`/`trigger` (Invoice print view's "Add Discount" quick-access
 * button) — both optional, backward compatible: every existing call site
 * omits them and gets byte-for-byte the same behavior as before (kind
 * defaults to `"WAIVER"`, trigger defaults to the plain `<Button>` below).
 * A caller that wants a discount-scoped shortcut (e.g. a green "Add
 * Discount" button on the invoice detail page, distinct from the
 * Concessions section's own generic trigger further down that same page)
 * passes `defaultKind="DISCOUNT"` and its own `trigger` element — the kind
 * `<Select>` inside the dialog is still fully editable either way, this
 * only changes what's pre-selected on open.
 */
export function RequestConcessionDialog({
  studentId,
  invoiceId,
  defaultKind = "WAIVER",
  trigger,
}: {
  studentId: string;
  invoiceId?: string;
  defaultKind?: ConcessionKind;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("billing.concessions.dialog");
  const tCommon = useTranslations("common");

  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<ConcessionKind>(defaultKind);
  const [targetMode, setTargetMode] = React.useState<TargetMode>("scheme");
  const [schemeId, setSchemeId] = React.useState("");
  const [sponsorAwardId, setSponsorAwardId] = React.useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const studentScoped = invoiceId === undefined;

  const schemesQuery = useConcessionSchemes();
  const sponsorAwardsQuery = useSponsorAwardsForStudent(studentId);
  const sponsorsQuery = useSponsors();
  const invoicesQuery = useStudentInvoices(studentScoped ? studentId : undefined);
  const requestMutation = useRequestConcession(studentId, invoiceId ?? (selectedInvoiceId || undefined));

  const schemeItems = React.useMemo(
    () => (schemesQuery.data ?? []).filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name })),
    [schemesQuery.data],
  );

  const sponsorNameById = React.useMemo(() => new Map((sponsorsQuery.data ?? []).map((s) => [s.id, s.name])), [sponsorsQuery.data]);
  const sponsorAwardItems = React.useMemo(
    () =>
      (sponsorAwardsQuery.data ?? []).map((award) => {
        const remaining = sumMoneyStrings([award.amount, negateDecimalString(award.appliedAmount)]);
        const sponsorName = sponsorNameById.get(award.sponsorId) ?? award.sponsorId;
        return { value: award.id, label: t("sponsorAwardItemLabel", { sponsor: sponsorName, remaining: formatMoney(remaining) }) };
      }),
    [sponsorAwardsQuery.data, sponsorNameById, t],
  );

  const targetableInvoiceItems = React.useMemo(
    () =>
      (invoicesQuery.data ?? [])
        .filter((inv) => (TARGETABLE_INVOICE_STATUSES as readonly string[]).includes(inv.status))
        .map((inv) => ({ value: inv.id, label: `${inv.number} — ${formatMoney(inv.balance)} ${t("balanceSuffix")}` })),
    [invoicesQuery.data, t],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setKind(defaultKind);
      setTargetMode("scheme");
      setSchemeId("");
      setSponsorAwardId("");
      setSelectedInvoiceId("");
      setAmount("");
      setReason("");
      setError(null);
    }
  }

  async function handleSubmit() {
    setError(null);
    const targetInvoiceId = invoiceId ?? selectedInvoiceId;
    if (studentScoped && !targetInvoiceId) {
      setError(t("invoiceRequired"));
      return;
    }
    if (targetMode === "scheme" && !schemeId) {
      setError(t("schemeRequired"));
      return;
    }
    if (targetMode === "sponsorAward" && !sponsorAwardId) {
      setError(t("sponsorAwardRequired"));
      return;
    }
    if (!amount.trim()) {
      setError(t("amountRequired"));
      return;
    }
    if (!reason.trim()) {
      setError(t("reasonRequired"));
      return;
    }
    try {
      const dto: RequestConcessionDto = {
        kind,
        studentId,
        invoiceId: targetInvoiceId,
        amount,
        reason: reason.trim(),
        ...(targetMode === "scheme" ? { schemeId } : { sponsorAwardId }),
      };
      await requestMutation.mutateAsync(dto);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? <Button type="button">{t("trigger")}</Button>}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {studentScoped && (
            <div className="space-y-1.5">
              <Label required>{t("invoice")}</Label>
              <Combobox
                items={targetableInvoiceItems}
                value={selectedInvoiceId}
                onChange={setSelectedInvoiceId}
                placeholder={invoicesQuery.isLoading ? tCommon("loading") : t("invoicePlaceholder")}
                searchPlaceholder={t("invoiceSearchPlaceholder")}
                emptyText={t("invoiceEmptyText")}
                disabled={invoicesQuery.isLoading}
              />
              <p className="text-xs text-muted-foreground">{t("invoiceHint")}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label required>{t("kind")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ConcessionKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILL_CONCESSION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`kindValues.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("targetMode")}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={targetMode === "scheme" ? "default" : "outline"}
                onClick={() => setTargetMode("scheme")}
              >
                {t("targetModeScheme")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={targetMode === "sponsorAward" ? "default" : "outline"}
                onClick={() => setTargetMode("sponsorAward")}
              >
                {t("targetModeSponsorAward")}
              </Button>
            </div>
          </div>

          {targetMode === "scheme" ? (
            <div className="space-y-1.5">
              <Label required>{t("scheme")}</Label>
              <Combobox
                items={schemeItems}
                value={schemeId}
                onChange={setSchemeId}
                placeholder={schemesQuery.isLoading ? tCommon("loading") : t("schemePlaceholder")}
                searchPlaceholder={t("schemeSearchPlaceholder")}
                emptyText={t("schemeEmptyText")}
                disabled={schemesQuery.isLoading}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label required>{t("sponsorAward")}</Label>
              <Combobox
                items={sponsorAwardItems}
                value={sponsorAwardId}
                onChange={setSponsorAwardId}
                placeholder={sponsorAwardsQuery.isLoading ? tCommon("loading") : t("sponsorAwardPlaceholder")}
                searchPlaceholder={t("sponsorAwardSearchPlaceholder")}
                emptyText={t("sponsorAwardEmptyText")}
                disabled={sponsorAwardsQuery.isLoading}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label required>{t("amount")}</Label>
            <MoneyInput value={amount} onValueChange={(v) => setAmount(v ?? "")} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("reason")}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={requestMutation.isPending}>
            {requestMutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
