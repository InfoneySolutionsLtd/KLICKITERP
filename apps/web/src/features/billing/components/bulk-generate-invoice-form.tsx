"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toaster";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { useActiveClasses } from "@/features/students/hooks/use-classes";
import { useStudents } from "@/features/students/hooks/use-students";
import { findWalletByStudent, sweepToInvoices } from "@/features/wallet/api/wallets.api";
import { isInsufficientBalanceError, isTransferNeedsApprovalError } from "@/features/wallet/lib/errors";
import { applyStudentCredit } from "../api/student-credit.api";
import { AcademicYearTermSelect } from "./academic-year-term-select";
import { FeeCategoryChipPicker } from "./fee-category-chip-picker";
import { StudentSelectionGrid } from "./student-selection-grid";
import { getInvoice } from "../api/invoices.api";
import { chooseOpenInvoiceBucket, mapWithConcurrency, summarizeGeneration, type OpenInvoiceBucket } from "../lib/invoice-generation-outcome";
import { orderInvoicesByDueDate } from "../lib/order-invoices-by-due-date";
import { useBulkGenerateAdhocInvoices, useCategoriesForScope } from "../hooks/use-bulk-adhoc-invoices";

/**
 * `"partialShortfall"` (Phase 6 Slice 12, Part B) — a real invoice that still
 * carries a balance after a wallet sweep (whether the sweep never reached it
 * at all because the wallet ran out first, or reached it and only partially
 * covered it — `WalletTransactionsService.sweepToInvoices()`'s own
 * `shortfall[]` array covers both cases identically, see its doc comment).
 * Deliberately distinct from `"insufficientBalance"` — that kind is the
 * THROWN `BR-WALL-01` floor-violation error (the transfer would push the
 * wallet below its overdraft floor, so the WHOLE aggregate call fails and
 * nothing at all was swept); `"partialShortfall"` is a normal, real `201`
 * response where SOME (possibly zero) money was swept and some balance
 * genuinely remains owing — not an error at all.
 */
export type WalletOutcomeKind = "settled" | "partialShortfall" | "needsApproval" | "insufficientBalance" | "noWallet" | "failed";

export interface WalletOutcome {
  studentId: string;
  invoiceId: string;
  /** The invoice's own number (e.g. "INV-000123") — what result lines show; `invoiceId` is only the fallback if it couldn't be loaded. */
  invoiceNumber?: string;
  amount: string;
  outcome: WalletOutcomeKind;
  message?: string;
  /** Only ever set on a `"settled"` outcome, and only when `sweepToInvoices()` actually created a receipt (i.e. SOME amount was swept this call). */
  receiptId?: string;
}

/**
 * Phase 6 Slice 12 (Part E) — the "Apply available credit balance"
 * checkbox's own outcome vocabulary. **Judgment call**: a deliberately
 * SEPARATE, narrower type from `WalletOutcomeKind` above, not a reuse of it
 * — the two backend response SHAPES are genuinely identical
 * (`{totalApplied/totalSwept, allocations, receiptId, shortfall}`), but the
 * outcome VOCABULARIES are not: `ReceiptsService.applyStudentCreditToInvoices()`
 * (confirmed by reading it directly, Part D) has no approval-threshold gate
 * (no FR-WALL-013.1 equivalent exists for Credit Balance) and never throws
 * an "insufficient balance" error — it simply applies `min(remaining,
 * invoice.balance)` per invoice and reports the rest via `shortfall`, the
 * same as an exhausted wallet's `sweepToInvoices()` call already does. There
 * is also no `"noWallet"`-equivalent precondition to check first: `GET
 * .../credit-balance` never 404s, and `applyStudentCredit()` takes
 * `studentId` directly — no separate "does this student have an account"
 * lookup is needed the way a wallet sweep needs a wallet id first. Reusing
 * `WalletOutcomeKind` here would mean either dead `switch`/i18n branches
 * that can never actually fire for this flow, or an unsafe cast — a small
 * parallel type (the plan's own offered alternative) models the REAL
 * outcome set instead.
 */
export type CreditBalanceOutcomeKind = "settled" | "partialShortfall" | "failed";

export interface CreditBalanceOutcome {
  studentId: string;
  invoiceId: string;
  /** The invoice's own number (e.g. "INV-000123") — what result lines show; `invoiceId` is only the fallback if it couldn't be loaded. */
  invoiceNumber?: string;
  amount: string;
  outcome: CreditBalanceOutcomeKind;
  message?: string;
  /** Only ever set on a `"settled"` outcome, and only when `applyStudentCredit()` actually created a receipt (i.e. SOME amount was applied this call). */
  receiptId?: string;
}

/**
 * Phase 6 Slice 12 (Part C) — resolves fee-category ids to their real
 * display names for the duplicate-billing skip notices below, the SAME way
 * `categoryOptions` already resolves them for `<FeeCategoryChipPicker>` —
 * falls back to the raw id only if a category somehow isn't in the current
 * scope's catalog (shouldn't normally happen, since every id here always
 * came from this same `categoriesQuery` catalog in the first place).
 */
function formatCategoryNames(ids: string[], categoryNameById: Map<string, string>): string {
  return ids.map((id) => categoryNameById.get(id) ?? id).join(", ");
}

interface GenerateSummary {
  succeededStudents: number;
  succeededInvoices: number;
  failed: { studentId: string; error: string }[];
  /**
   * Phase 6 Slice 12 (Part C) — students whose ENTIRE selected-category set
   * was already really billed this term: nothing was generated for them at
   * all. Distinct from `failed` (not an error — a signal to uncheck and retry).
   */
  skipped: { studentId: string; alreadyBilledCategoryIds: string[] }[];
  /**
   * Phase 6 Slice 12 (Part C) — students who DID succeed, but only for SOME
   * of their selected categories, because the rest were already billed this
   * term. Derived from `result.succeeded[].alreadyBilledCategoryIds`.
   */
  partiallySkipped: { studentId: string; alreadyBilledCategoryIds: string[] }[];
}

/**
 * Slice 2 (Phase 6 Slice 8) — the bulk "Generate Invoice" screen's form:
 * academic-year/term (`<AcademicYearTermSelect autoSelectCurrent>`, reused
 * verbatim from the existing per-student `GenerateInvoiceDialog`) + a grade
 * `<Select>` (`useActiveClasses()`, existing) + Slice 0's
 * `<FeeCategoryChipPicker>` (fed by the new categories-for-scope endpoint
 * once both year+class are chosen) + Slice 0's `<Checkbox>`-backed
 * `<StudentSelectionGrid>` + a "Collect amount from student wallet"
 * checkbox. On submit, calls the Slice 1 bulk-generate endpoint, then —
 * only if the wallet checkbox is checked — calls the new (Phase 6 Slice 12,
 * Part A/B) `sweepToInvoices()` endpoint ONCE PER SUCCEEDED STUDENT (not
 * once per invoice, per the plan) with that student's own newly-generated
 * invoice ids, oldest-due-first. The succeeded/failed summary UX mirrors
 * `FeeStructureCreateDialog`'s own established partial-result pattern.
 *
 * **Phase 6 Slice 12 (Part B)** replaced this file's original naive
 * per-invoice `transferToFees()` loop (Slice 8) with real
 * `sweepToInvoices()` calls — see `runWalletCollection()`'s own doc comment
 * below for the full outcome-mapping logic.
 *
 * **Phase 6 Slice 12 (Part E)** added a sibling "Apply available credit
 * balance" checkbox, wired to the new `applyStudentCredit()` endpoint the
 * same way the wallet checkbox is wired to `sweepToInvoices()` — see
 * `runCreditBalanceCollection()`'s own doc comment below for its
 * outcome-mapping logic and its `CreditBalanceOutcomeKind` doc comment for
 * why it's a separate, narrower type rather than a reuse of
 * `WalletOutcomeKind`. When BOTH checkboxes are checked, wallet runs first,
 * then credit balance — see `handleSubmit()`'s own ordering comment.
 */
export function BulkGenerateInvoiceForm() {
  const t = useTranslations("billing.bulkGenerate");
  const tCommon = useTranslations("common");
  const classesQuery = useActiveClasses();
  const router = useRouter();
  const toast = useToast();

  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [termId, setTermId] = React.useState<string | null>(null);
  const [classId, setClassId] = React.useState<string | null>(null);
  const [feeCategoryIds, setFeeCategoryIds] = React.useState<string[]>([]);
  const [studentIds, setStudentIds] = React.useState<string[]>([]);
  const [collectFromWallet, setCollectFromWallet] = React.useState(false);
  const [applyCreditBalance, setApplyCreditBalance] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<GenerateSummary | null>(null);
  const [walletOutcomes, setWalletOutcomes] = React.useState<WalletOutcome[] | null>(null);
  const [walletProcessing, setWalletProcessing] = React.useState(false);
  const [creditBalanceOutcomes, setCreditBalanceOutcomes] = React.useState<CreditBalanceOutcome[] | null>(null);
  const [creditBalanceProcessing, setCreditBalanceProcessing] = React.useState(false);
  // True from the moment a clean run finishes until we have navigated away (or found nowhere to go) —
  // while the Pending/Upcoming page is being worked out the form must stay locked, or a second click
  // would generate the same invoices twice.
  const [leaving, setLeaving] = React.useState(false);

  const categoriesQuery = useCategoriesForScope(academicYearId ?? undefined, classId ?? undefined);
  const bulkGenerateMutation = useBulkGenerateAdhocInvoices();

  // Identical params to `<StudentSelectionGrid>`'s own query, so this shares its
  // cache entry (no extra request) — it is the source of the student names the
  // result card shows in place of the bare ids the API returns.
  const studentsQuery = useStudents({ classId: classId ?? undefined, status: "ACTIVE", pageSize: 200 }, { enabled: !!classId });
  // A snapshot taken when the form is submitted, not a live lookup: changing the
  // class afterwards swaps the student list, but the result card on screen must
  // keep naming the students it was generated for.
  const [resultStudentNames, setResultStudentNames] = React.useState<Map<string, string>>(() => new Map());
  /** "First Last (admission no.)" — the same label the student grid shows; the raw id only if a student somehow isn't in the loaded list. */
  const studentLabel = (id: string) => resultStudentNames.get(id) ?? id;

  // A different class means a different category catalog AND a different student population —
  // stale selections from the previous class must not silently carry over.
  React.useEffect(() => {
    setFeeCategoryIds([]);
    setStudentIds([]);
  }, [classId]);

  const categoryOptions = React.useMemo(
    () =>
      (categoriesQuery.data ?? []).map((c) => ({
        value: c.feeCategoryId,
        label: `${c.name} (${formatMoney(c.exampleAmount)})`,
      })),
    [categoriesQuery.data],
  );

  /** Phase 6 Slice 12 (Part C) — plain id->name lookup for the skip notices, same source data as `categoryOptions`. */
  const categoryNameById = React.useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.feeCategoryId, c.name])),
    [categoriesQuery.data],
  );

  const submitting = bulkGenerateMutation.isPending || walletProcessing || creditBalanceProcessing || leaving;

  /** Shows a problem both inline (top of the form) and as a toast at the top of the screen, where it can't be missed. */
  function fail(message: string) {
    setError(message);
    toast.error(message);
  }

  /**
   * Which open-invoice list the freshly generated invoices are on: reads each one back (due date + the
   * balance AFTER any wallet / credit-balance collection) and applies the lists' own split. Any failure
   * to read them means "don't redirect" — the user simply stays on this screen with the result.
   */
  async function findOpenInvoiceBucket(invoiceIds: string[]): Promise<OpenInvoiceBucket | null> {
    try {
      const invoices = await mapWithConcurrency([...new Set(invoiceIds)], 8, (id) => getInvoice(id));
      return chooseOpenInvoiceBucket(invoices);
    } catch {
      return null;
    }
  }

  async function handleSubmit() {
    setError(null);
    setSummary(null);
    setWalletOutcomes(null);
    setCreditBalanceOutcomes(null);

    if (!termId) {
      fail(t("termRequired"));
      return;
    }
    if (!classId) {
      fail(t("classRequired"));
      return;
    }
    if (feeCategoryIds.length === 0) {
      fail(t("categoriesRequired"));
      return;
    }
    if (studentIds.length === 0) {
      fail(t("studentsRequired"));
      return;
    }

    setResultStudentNames(
      new Map((studentsQuery.data?.items ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName} (${s.admissionNo})`])),
    );

    let result;
    try {
      result = await bulkGenerateMutation.mutateAsync({ termId, classId, feeCategoryIds, studentIds });
    } catch (err) {
      fail(err instanceof ApiError ? err.message : t("genericError"));
      return;
    }

    setSummary({
      succeededStudents: result.succeeded.length,
      succeededInvoices: result.succeeded.reduce((sum, s) => sum + s.invoiceIds.length, 0),
      failed: result.failed,
      skipped: result.skipped,
      partiallySkipped: result.succeeded
        .filter((s) => s.alreadyBilledCategoryIds && s.alreadyBilledCategoryIds.length > 0)
        .map((s) => ({ studentId: s.studentId, alreadyBilledCategoryIds: s.alreadyBilledCategoryIds ?? [] })),
    });

    // Phase 6 Slice 12 (Part E) — ordering decision, when BOTH checkboxes are
    // checked: wallet runs FIRST, credit balance SECOND. Wallet was the
    // pre-existing behavior (Part B); credit balance is layered on after it
    // as the new addition, run sequentially against the same
    // newly-generated invoices — the obvious, minimally-surprising choice
    // per the plan's own instruction, and it also means an invoice can be
    // fully settled by the wallet before credit balance is even consulted,
    // so credit balance is only ever applied to whatever the wallet didn't
    // already cover.
    const walletResult = collectFromWallet && result.succeeded.length > 0 ? await runWalletCollection(result.succeeded) : [];
    const creditResult = applyCreditBalance && result.succeeded.length > 0 ? await runCreditBalanceCollection(result.succeeded) : [];

    // Tell the user how it went — at the top of the screen — and, if (and only if) the run was clean,
    // take them to the invoice list the new invoices are on. The detailed result card below stays for
    // anything that needs reading (failures, skips, wallet outcomes).
    const invoices = result.succeeded.reduce((sum, s) => sum + s.invoiceIds.length, 0);
    const collectionProblems =
      walletResult.filter((o) => o.outcome === "failed" || o.outcome === "needsApproval" || o.outcome === "insufficientBalance").length +
      creditResult.filter((o) => o.outcome === "failed").length;
    const outcome = summarizeGeneration({ invoices, students: result.succeeded.length, failed: result.failed.length, collectionProblems });

    const skippedAffected = result.skipped.length + result.succeeded.filter((s) => (s.alreadyBilledCategoryIds?.length ?? 0) > 0).length;
    const message = [
      t(`toast.${outcome.messageKey}`, { invoices, students: result.succeeded.length, failed: result.failed.length }),
      outcome.kind === "success" && skippedAffected > 0 ? t("toast.skippedNote", { count: skippedAffected }) : "",
    ]
      .filter(Boolean)
      .join(" ");
    toast[outcome.kind](message);

    if (!outcome.leaveScreen) return;

    setLeaving(true);
    const bucket = await findOpenInvoiceBucket(result.succeeded.flatMap((s) => s.invoiceIds));
    if (bucket) {
      router.push(bucket === "PENDING" ? "/billing/pending" : "/billing/upcoming");
    } else {
      setLeaving(false);
    }
  }

  /**
   * Phase 6 Slice 12 (Part B) — one real `sweepToInvoices()` call per
   * succeeded student (not one `transferToFees()` call per invoice, Slice
   * 8's original design), each call covering ALL of that student's own
   * newly-generated invoices at once, oldest-due-first
   * (`orderInvoicesByDueDate()`).
   *
   * Response mapping (per the plan's own explicit spec):
   *  - every invoice in `response.allocations` gets a `"settled"` outcome
   *    (its real swept amount + the receipt id, for a link) — this includes
   *    an invoice that was only PARTIALLY covered, which also appears below;
   *  - every invoice in `response.shortfall` gets its own, separate
   *    `"partialShortfall"` outcome (its real remaining balance) — this
   *    covers both "reached but only partly covered" AND "never reached at
   *    all because the wallet ran out first" identically, including the
   *    genuinely-zero-swept case (`totalSwept === "0.0000"`, e.g. an empty
   *    wallet) where `allocations` is empty and every invoice's full balance
   *    shows up here — a real `201`, not a thrown error, so it's handled by
   *    this same unconditional pass over `shortfall`, not a separate
   *    "wallet empty" branch.
   * An invoice can legitimately produce BOTH a `"settled"` and a
   * `"partialShortfall"` outcome in the same run (partially covered) — the
   * summary list below keys each `<li>` on `${invoiceId}-${outcome}`, not
   * `invoiceId` alone, to stay unique.
   *
   * A thrown error from `sweepToInvoices()` itself means the WHOLE aggregate
   * call failed (nothing at all was swept for this student) — every one of
   * that student's invoices gets the SAME outcome kind, not a per-invoice
   * breakdown, since the backend never got far enough to produce one.
   */
  async function runWalletCollection(succeeded: { studentId: string; invoiceIds: string[] }[]): Promise<WalletOutcome[]> {
    setWalletProcessing(true);
    const outcomes: WalletOutcome[] = [];
    // One wallet lookup per student, reused across every one of that student's own invoices this run.
    const walletIdByStudent = new Map<string, string | null>();

    for (const student of succeeded) {
      // One load per student: gives the due-date order the sweep needs AND the
      // invoice numbers every result line below shows (see `orderInvoicesByDueDate()`).
      const ordering = await orderInvoicesByDueDate(student.invoiceIds);
      const invoiceNumber = (invoiceId: string) => ordering.numberById.get(invoiceId);

      let walletId = walletIdByStudent.get(student.studentId);
      if (walletId === undefined) {
        const wallet = await findWalletByStudent(student.studentId).catch(() => null);
        walletId = wallet?.id ?? null;
        walletIdByStudent.set(student.studentId, walletId);
      }

      if (!walletId) {
        for (const invoiceId of student.invoiceIds) {
          outcomes.push({ studentId: student.studentId, invoiceId, invoiceNumber: invoiceNumber(invoiceId), amount: "0.0000", outcome: "noWallet" });
        }
        continue;
      }

      try {
        if (!ordering.ok) throw ordering.error;
        const result = await sweepToInvoices(walletId, { invoiceIds: ordering.orderedIds });

        for (const alloc of result.allocations) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: alloc.invoiceId,
            invoiceNumber: invoiceNumber(alloc.invoiceId),
            amount: alloc.amount,
            outcome: "settled",
            receiptId: result.receiptId ?? undefined,
          });
        }
        for (const shortfall of result.shortfall) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: shortfall.invoiceId,
            invoiceNumber: invoiceNumber(shortfall.invoiceId),
            amount: shortfall.remainingBalance,
            outcome: "partialShortfall",
          });
        }
      } catch (err) {
        if (isTransferNeedsApprovalError(err)) {
          for (const invoiceId of student.invoiceIds) {
            outcomes.push({ studentId: student.studentId, invoiceId, invoiceNumber: invoiceNumber(invoiceId), amount: "", outcome: "needsApproval" });
          }
        } else if (isInsufficientBalanceError(err)) {
          for (const invoiceId of student.invoiceIds) {
            outcomes.push({ studentId: student.studentId, invoiceId, invoiceNumber: invoiceNumber(invoiceId), amount: "", outcome: "insufficientBalance" });
          }
        } else {
          const message = err instanceof ApiError ? err.message : t("genericError");
          for (const invoiceId of student.invoiceIds) {
            outcomes.push({ studentId: student.studentId, invoiceId, invoiceNumber: invoiceNumber(invoiceId), amount: "", outcome: "failed", message });
          }
        }
      }
    }

    setWalletOutcomes(outcomes);
    setWalletProcessing(false);
    return outcomes;
  }

  /**
   * Phase 6 Slice 12 (Part E) — the "Apply available credit balance"
   * checkbox's own collection loop, run AFTER `runWalletCollection()` when
   * both checkboxes are checked (see `handleSubmit()`'s own ordering
   * comment). One real `applyStudentCredit()` call per succeeded student,
   * covering ALL of that student's own newly-generated invoices at once,
   * oldest-due-first (`orderInvoicesByDueDate()` —
   * `applyStudentCreditToInvoices()` has the identical caller-ordered
   * contract `sweepToInvoices()` does).
   *
   * Response mapping mirrors `runWalletCollection()`'s (see its own doc
   * comment for the full reasoning) but over the narrower
   * `CreditBalanceOutcomeKind` vocabulary (see that type's own doc comment
   * for why it's not a reuse of `WalletOutcomeKind`): every invoice in
   * `response.allocations` gets `"settled"`; every invoice in
   * `response.shortfall` gets `"partialShortfall"` (covers both "reached but
   * only partly covered" and "never reached because the balance ran out
   * first", including the genuinely-zero-applied case where `allocations`
   * is empty — a real `201`, not a thrown error). A thrown error marks the
   * WHOLE student's invoice set `"failed"` — there is no `needsApproval`/
   * `insufficientBalance` split to make here, since neither is a real
   * possible outcome for this endpoint.
   */
  async function runCreditBalanceCollection(succeeded: { studentId: string; invoiceIds: string[] }[]): Promise<CreditBalanceOutcome[]> {
    setCreditBalanceProcessing(true);
    const outcomes: CreditBalanceOutcome[] = [];

    for (const student of succeeded) {
      // One load per student — see the same line in `runWalletCollection()`.
      const ordering = await orderInvoicesByDueDate(student.invoiceIds);
      const invoiceNumber = (invoiceId: string) => ordering.numberById.get(invoiceId);

      try {
        if (!ordering.ok) throw ordering.error;
        const result = await applyStudentCredit({ studentId: student.studentId, invoiceIds: ordering.orderedIds });

        for (const alloc of result.allocations) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: alloc.invoiceId,
            invoiceNumber: invoiceNumber(alloc.invoiceId),
            amount: alloc.amount,
            outcome: "settled",
            receiptId: result.receiptId ?? undefined,
          });
        }
        for (const shortfall of result.shortfall) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: shortfall.invoiceId,
            invoiceNumber: invoiceNumber(shortfall.invoiceId),
            amount: shortfall.remainingBalance,
            outcome: "partialShortfall",
          });
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : t("genericError");
        for (const invoiceId of student.invoiceIds) {
          outcomes.push({ studentId: student.studentId, invoiceId, invoiceNumber: invoiceNumber(invoiceId), amount: "", outcome: "failed", message });
        }
      }
    }

    setCreditBalanceOutcomes(outcomes);
    setCreditBalanceProcessing(false);
    return outcomes;
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
            <Label required>{t("feeCategories")}</Label>
            {!academicYearId || !classId ? (
              <p className="text-sm text-muted-foreground">{t("selectYearAndClassFirst")}</p>
            ) : categoriesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("loadingCategories")}</p>
            ) : categoryOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCategoriesForScope")}</p>
            ) : (
              <FeeCategoryChipPicker options={categoryOptions} selected={feeCategoryIds} onChange={setFeeCategoryIds} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label required>{t("students")}</Label>
            <StudentSelectionGrid classId={classId} selected={studentIds} onChange={setStudentIds} />
          </div>

          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={collectFromWallet} onChange={(e) => setCollectFromWallet(e.target.checked)} />
              {t("collectFromWallet")}
            </label>
            {collectFromWallet && <p className="pl-6 text-xs text-muted-foreground">{t("collectFromWalletNotice")}</p>}
          </div>

          {/* Phase 6 Slice 12 (Part E) — sibling checkbox to "Collect amount
              from student wallet" above, same inline-notice-on-check
              pattern. Wallet runs first, this runs second, when both are
              checked (see `handleSubmit()`'s own ordering comment). */}
          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={applyCreditBalance} onChange={(e) => setApplyCreditBalance(e.target.checked)} />
              {t("applyCreditBalance")}
            </label>
            {applyCreditBalance && <p className="pl-6 text-xs text-muted-foreground">{t("applyCreditBalanceNotice")}</p>}
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {bulkGenerateMutation.isPending
                ? t("generating")
                : walletProcessing
                  ? t("collecting")
                  : creditBalanceProcessing
                    ? t("applyingCredit")
                    : leaving
                      ? t("openingInvoices")
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
            <Alert variant={summary.failed.length > 0 || summary.skipped.length > 0 ? "warning" : "success"}>
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
                      {studentLabel(f.studentId)}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Phase 6 Slice 12 (Part C) — FULL duplicate-billing skips: distinct from `failed` above (not an error). */}
            {summary.skipped.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">{t("resultSkippedTitle")}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {summary.skipped.map((s) => (
                    <li key={s.studentId}>
                      {t("resultSkippedEntry", {
                        student: studentLabel(s.studentId),
                        categories: formatCategoryNames(s.alreadyBilledCategoryIds, categoryNameById),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Phase 6 Slice 12 (Part C) — PARTIAL duplicate-billing skips: the student still succeeded, but only for some of their selected categories. */}
            {summary.partiallySkipped.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">{t("resultPartialSkipTitle")}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {summary.partiallySkipped.map((s) => (
                    <li key={s.studentId}>
                      {t("resultPartialSkipEntry", {
                        student: studentLabel(s.studentId),
                        categories: formatCategoryNames(s.alreadyBilledCategoryIds, categoryNameById),
                      })}
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
                      {studentLabel(o.studentId)} / {o.invoiceNumber ?? `${o.invoiceId.slice(0, 8)}…`}: {t(`walletOutcome.${o.outcome}`, { amount: formatMoney(o.amount || "0.0000") })}
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

            {/* Phase 6 Slice 12 (Part E) — a SEPARATE results section from
                the wallet one above, deliberately not merged into one
                undifferentiated list: these are two distinct funding
                sources, and the accountant needs to see each's own real
                per-invoice outcome independently. */}
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
                      {studentLabel(o.studentId)} / {o.invoiceNumber ?? `${o.invoiceId.slice(0, 8)}…`}: {t(`creditBalanceOutcome.${o.outcome}`, { amount: formatMoney(o.amount || "0.0000") })}
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
