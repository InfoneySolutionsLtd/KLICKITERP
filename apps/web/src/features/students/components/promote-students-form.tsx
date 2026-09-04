"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MultiSelect, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StudentResponseDto } from "@klickit/contracts";
import { ApiError } from "@/lib/api-error";
import { useAcademicYears } from "@/features/billing/hooks/use-academic-calendar";
import { listStudents } from "@/features/students/api/students.api";
import { useClasses } from "@/features/students/hooks/use-classes";
import { computeDefaultTargetClass, buildPromotionInputs, type PromotionCandidateRow } from "../lib/promotion-candidates";
import { usePromoteBatch } from "../hooks/use-promotion-batches";
import { PromotionCandidatesTable } from "./promotion-candidates-table";

/** `PaginationQueryDto.pageSize`'s own real server-side ceiling (`@Max(200)`) — a single class can genuinely hold more than 200 active students, so `fetchAllActiveStudentsInClass()` below pages through every page at this size rather than assuming one page is enough. */
const MAX_PAGE_SIZE = 200;

/** Fetches every ACTIVE student in a class, paging at the real server-side max, since a single class isn't guaranteed to fit in one page. */
async function fetchAllActiveStudentsInClass(classId: string): Promise<StudentResponseDto[]> {
  const students: StudentResponseDto[] = [];
  let page = 1;
  for (;;) {
    const result = await listStudents({ classId, status: "ACTIVE", page, pageSize: MAX_PAGE_SIZE });
    students.push(...result.items);
    if (students.length >= result.total || result.items.length === 0) break;
    page += 1;
  }
  return students;
}

/**
 * "New Promotion Batch" — configure scope, load real candidates, review/
 * override per student, confirm, submit. No backend candidate-generation or
 * preview endpoint exists (see `promotion-batches.api.ts`'s own doc
 * comment) — the whole pipeline from "pick a class" to "build the real
 * request body" happens here. Mirrors `bulk-billing-form.tsx`'s established
 * shape (scope card -> confirm dialog -> single commit), but with a real
 * per-student review step in between, since a promotion batch always needs
 * a real target class per student, unlike a bulk-bill run.
 */
export function PromoteStudentsForm() {
  const t = useTranslations("students.promotionBatches.newForm");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [fromYearId, setFromYearId] = React.useState("");
  const [toYearId, setToYearId] = React.useState("");
  const [classIds, setClassIds] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<PromotionCandidateRow[] | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const academicYearsQuery = useAcademicYears();
  const classesQuery = useClasses();
  const promoteMutation = usePromoteBatch();
  const submitting = promoteMutation.isPending;

  const yearOptions = React.useMemo(() => (academicYearsQuery.data ?? []).map((y) => ({ value: y.id, label: y.name })), [academicYearsQuery.data]);
  const classOptions = React.useMemo(() => (classesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })), [classesQuery.data]);

  const [loadingCandidates, setLoadingCandidates] = React.useState(false);

  async function handleLoadCandidates() {
    setFormError(null);
    setRows(null);
    if (!fromYearId || !toYearId) {
      setFormError(t("yearsRequiredError"));
      return;
    }
    if (classIds.length === 0) {
      setFormError(t("classesRequiredError"));
      return;
    }
    setLoadingCandidates(true);
    try {
      const results = await Promise.all(classIds.map((classId) => fetchAllActiveStudentsInClass(classId)));
      const classes = classesQuery.data ?? [];
      const byId = new Map<string, PromotionCandidateRow>();
      for (const students of results) {
        for (const student of students) {
          if (byId.has(student.id)) continue; // a student could theoretically appear via more than one selected class filter overlap — dedupe defensively
          const target = computeDefaultTargetClass(student.classId, classes);
          byId.set(student.id, {
            studentId: student.id,
            admissionNo: student.admissionNo,
            studentLabel: `${student.firstName} ${student.lastName}`,
            currentClassId: student.classId,
            currentStreamId: student.streamId ?? null,
            toClassId: target?.id ?? "",
            toStreamId: "",
            excluded: false,
          });
        }
      }
      setRows(Array.from(byId.values()));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setLoadingCandidates(false);
    }
  }

  const activeCount = (rows ?? []).filter((r) => !r.excluded && r.toClassId).length;
  const canOpenConfirm = rows !== null && activeCount > 0;

  function handleOpenConfirm() {
    if (!canOpenConfirm) return;
    setSubmitError(null);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!rows) return;
    setSubmitError(null);
    try {
      const batch = await promoteMutation.mutateAsync({
        fromYearId,
        toYearId,
        promotions: buildPromotionInputs(rows),
      });
      setConfirmOpen(false);
      router.push(`/students/promotion-batches/${batch.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  const fromYearName = yearOptions.find((y) => y.value === fromYearId)?.label ?? fromYearId;
  const toYearName = yearOptions.find((y) => y.value === toYearId)?.label ?? toYearId;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("scopeTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 sm:max-w-xl">
            <div className="space-y-1.5">
              <Label required>{t("fromYearLabel")}</Label>
              <Select value={fromYearId} onValueChange={setFromYearId} disabled={loadingCandidates}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectYear")} />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("toYearLabel")}</Label>
              <Select value={toYearId} onValueChange={setToYearId} disabled={loadingCandidates}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectYear")} />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("classesLabel")}</Label>
            <MultiSelect
              options={classOptions}
              selected={classIds}
              onChange={setClassIds}
              placeholder={t("selectClasses")}
              disabled={classesQuery.isLoading || loadingCandidates}
              className="sm:w-96"
            />
            <p className="text-xs text-muted-foreground">{t("classesHint")}</p>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => void handleLoadCandidates()} disabled={loadingCandidates}>
              {loadingCandidates ? t("loadingCandidates") : t("loadCandidatesButton")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("candidatesTitle", { count: rows.length })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>{t("noBalanceInteractionHint")}</AlertDescription>
            </Alert>

            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("noCandidates")}</p>
            ) : (
              <>
                <PromotionCandidatesTable rows={rows} onChange={setRows} classes={classesQuery.data ?? []} />
                <div className="flex justify-end">
                  <Button type="button" onClick={handleOpenConfirm} disabled={!canOpenConfirm}>
                    {t("reviewAndSubmit", { count: activeCount })}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={(next) => !submitting && setConfirmOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("confirmDialog.body", { count: activeCount, fromYear: fromYearName, toYear: toYearName })}
            </DialogDescription>
          </DialogHeader>

          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {submitting && (
            <Alert variant="warning">
              <AlertTitle>{t("inFlightNoticeTitle")}</AlertTitle>
              <AlertDescription>{t("inFlightNotice")}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={submitting}>
              {submitting ? t("submitting") : t("confirmDialog.confirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
