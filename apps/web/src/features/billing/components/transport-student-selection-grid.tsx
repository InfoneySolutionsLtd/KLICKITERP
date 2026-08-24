"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useStudents } from "@/features/students/hooks/use-students";

/**
 * Bill Transport workflow's own student picker — a deliberate copy of
 * `student-selection-grid.tsx` (`billing.bulkGenerate`'s own grid), not a
 * shared/parameterized reuse of it, matching this codebase's own established
 * convention of duplicating per-screen selection/orchestration logic rather
 * than growing one shared component with feature-specific branches (see
 * `bulk-generate-invoice-form.tsx`'s own doc comment on why
 * `sortInvoiceIdsByDueDate()`/wallet-sweep orchestration is duplicated per
 * screen, not shared) — `StudentSelectionGrid` has exactly one other
 * consumer today, so this avoids adding a `routeId`-shaped branch to a
 * component another screen also depends on.
 *
 * The one real behavioral difference: the FIRST time a given
 * (classId, routeId) pair's student list loads, every student whose own
 * `transportRouteId` already matches the selected route is pre-checked —
 * there is no server-side "list students by transport route" filter
 * (confirmed by reading `ListStdStudentsFilter`), so this fetches by
 * `classId` (existing endpoint) and pre-checks client-side. Pre-checking
 * only fires ONCE per (classId, routeId) combination (tracked via
 * `appliedKeyRef`) — after that, every toggle is left entirely to the user,
 * so an admin can freely add/remove specific students without the grid
 * fighting their edits on every re-render.
 */
export function TransportStudentSelectionGrid({
  classId,
  routeId,
  selected,
  onChange,
}: {
  classId: string | null;
  routeId: string | null;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("billing.transportRoutes.billForm");
  const studentsQuery = useStudents({ classId: classId ?? undefined, status: "ACTIVE", pageSize: 200 }, { enabled: !!classId });
  const [searchDraft, setSearchDraft] = React.useState("");

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const appliedKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = `${classId ?? ""}::${routeId ?? ""}`;
    if (!classId || !routeId || !studentsQuery.data || appliedKeyRef.current === key) return;
    appliedKeyRef.current = key;
    const preselected = studentsQuery.data.items.filter((s) => s.transportRouteId === routeId).map((s) => s.id);
    onChange(preselected);
    // Only re-run when the class/route pair changes or the fetched data identity changes — not on every `onChange` identity change (callers commonly pass an inline setter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, routeId, studentsQuery.data]);

  function toggleOne(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  function toggleAll(ids: string[]) {
    const allSelected = ids.length > 0 && ids.every((id) => selectedSet.has(id));
    if (allSelected) {
      onChange(selected.filter((id) => !ids.includes(id)));
    } else {
      const merged = new Set(selected);
      for (const id of ids) merged.add(id);
      onChange([...merged]);
    }
  }

  if (!classId || !routeId) {
    return <p className="text-sm text-muted-foreground">{t("selectClassAndRouteFirst")}</p>;
  }

  return (
    <QueryBoundary query={studentsQuery} isEmpty={(d) => d.items.length === 0}>
      {(data) => {
        const students = data.items;
        const query = searchDraft.trim().toLowerCase();
        const filteredStudents =
          query.length === 0
            ? students
            : students.filter((student) => {
                const name = `${student.firstName} ${student.lastName}`.toLowerCase();
                return name.includes(query) || student.admissionNo.toLowerCase().includes(query);
              });
        const ids = filteredStudents.map((s) => s.id);
        const allSelected = ids.length > 0 && ids.every((id) => selectedSet.has(id));
        return (
          <div className="space-y-3">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("studentSearchPlaceholder")}
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={allSelected} onChange={() => toggleAll(ids)} />
                {t("selectAll")}
              </label>
              <span className="text-xs text-muted-foreground">{t("selectedCount", { count: selected.length })}</span>
            </div>
            {filteredStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noStudentsMatchSearch")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {filteredStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Checkbox checked={selectedSet.has(student.id)} onChange={() => toggleOne(student.id)} />
                    <span className="truncate">
                      {student.firstName} {student.lastName}
                      <span className="ml-1 text-xs text-muted-foreground">({student.admissionNo})</span>
                      {student.transportRouteId === routeId && (
                        <span className="ml-1 text-xs text-primary">{t("onThisRouteTag")}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </QueryBoundary>
  );
}
