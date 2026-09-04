"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ClassResponseDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listStreamsForClass } from "@/features/students/api/streams.api";
import { updateCandidateRow, type PromotionCandidateRow } from "../lib/promotion-candidates";

const NONE_SENTINEL = "__NONE__";

/**
 * The per-student review/override grid for the "New Promotion Batch" flow.
 * Each row's target-class default was already computed by
 * `computeDefaultTargetClass()` when the row was built (see
 * `promote-students-form.tsx`) — this component only handles editing/
 * excluding from there. Stream options are fetched per DISTINCT target
 * class currently selected across all rows (`useQueries`, the same fan-out
 * shape `bulk-billing-form.tsx` already establishes for its own
 * class-scoped streams picker), not per-row, so switching two rows to the
 * same target class shares one cached fetch.
 */
export function PromotionCandidatesTable({
  rows,
  onChange,
  classes,
}: {
  rows: PromotionCandidateRow[];
  onChange: (rows: PromotionCandidateRow[]) => void;
  classes: ClassResponseDto[];
}) {
  const t = useTranslations("students.promotionBatches.candidatesTable");
  const classById = React.useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const classOptions = React.useMemo(
    () => [...classes].sort((a, b) => a.level - b.level).map((c) => ({ value: c.id, label: c.name })),
    [classes],
  );

  const targetClassIds = React.useMemo(() => Array.from(new Set(rows.map((r) => r.toClassId).filter(Boolean))), [rows]);
  const streamsQueries = useQueries({
    queries: targetClassIds.map((classId) => ({
      queryKey: ["students", "streams", classId] as const,
      queryFn: () => listStreamsForClass(classId),
    })),
  });
  const streamOptionsByClassId = React.useMemo(() => {
    const map = new Map<string, { value: string; label: string }[]>();
    targetClassIds.forEach((classId, index) => {
      const options = (streamsQueries[index]?.data ?? []).map((s) => ({ value: s.id, label: s.name }));
      map.set(classId, options);
    });
    return map;
  }, [targetClassIds, streamsQueries]);

  function patchRow(studentId: string, patch: Partial<PromotionCandidateRow>) {
    onChange(updateCandidateRow(rows, studentId, patch));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("student")}</TableHead>
            <TableHead>{t("currentClass")}</TableHead>
            <TableHead>{t("targetClass")}</TableHead>
            <TableHead>{t("targetStream")}</TableHead>
            <TableHead className="w-24">{t("exclude")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isGraduating = !row.toClassId;
            const streamOptions = row.toClassId ? (streamOptionsByClassId.get(row.toClassId) ?? []) : [];
            return (
              <TableRow key={row.studentId} className={row.excluded ? "opacity-50" : undefined}>
                <TableCell>
                  <div className="font-medium text-foreground">{row.studentLabel}</div>
                  <div className="text-xs text-muted-foreground">{row.admissionNo}</div>
                </TableCell>
                <TableCell>{classById.get(row.currentClassId)?.name ?? row.currentClassId}</TableCell>
                <TableCell className="min-w-[160px]">
                  <Select
                    value={row.toClassId || NONE_SENTINEL}
                    onValueChange={(v) => patchRow(row.studentId, { toClassId: v === NONE_SENTINEL ? "" : v, toStreamId: "" })}
                    disabled={row.excluded}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("noTargetClass")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_SENTINEL}>{t("noTargetClass")}</SelectItem>
                      {classOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isGraduating && !row.excluded && <Badge variant="soft-warning" className="mt-1">{t("graduatingBadge")}</Badge>}
                </TableCell>
                <TableCell className="min-w-[160px]">
                  <Select
                    value={row.toStreamId || NONE_SENTINEL}
                    onValueChange={(v) => patchRow(row.studentId, { toStreamId: v === NONE_SENTINEL ? "" : v })}
                    disabled={row.excluded || !row.toClassId || streamOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("noStream")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_SENTINEL}>{t("noStream")}</SelectItem>
                      {streamOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Checkbox checked={row.excluded} onChange={(e) => patchRow(row.studentId, { excluded: e.target.checked })} aria-label={t("exclude")} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
