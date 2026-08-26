"use client";

import * as React from "react";
import type { StudentResponseDto } from "@klickit/contracts";
import { StudentSearchBox } from "@/features/payments/components/student-search-box";
import { useStudent } from "@/features/students/hooks/use-students";

/**
 * Bridges `StudentSearchBox`'s richer `{selectedStudent, onSelect}` contract
 * down to the same `{value: string, onChange}` shape every other param
 * picker uses. Re-hydrates the full student object via `useStudent(value)`
 * whenever `value` is set from outside this widget itself (e.g. a future
 * saved-params reload — `reports:saved-params:manage` already exists
 * server-side) — the optimistic path in `handleSelect` already sets
 * `selectedStudent` synchronously, so `needsHydration` is false (no
 * redundant refetch) for every pick made through this UI.
 */
export function StudentParamField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [selectedStudent, setSelectedStudent] = React.useState<StudentResponseDto | null>(null);

  const needsHydration = !!value && selectedStudent?.id !== value;
  const hydrateQuery = useStudent(needsHydration ? value : undefined);

  React.useEffect(() => {
    if (hydrateQuery.data && hydrateQuery.data.id === value) setSelectedStudent(hydrateQuery.data);
  }, [hydrateQuery.data, value]);

  React.useEffect(() => {
    if (!value) setSelectedStudent(null);
  }, [value]);

  function handleSelect(student: StudentResponseDto | null) {
    setSelectedStudent(student);
    onChange(student?.id ?? "");
  }

  return <StudentSearchBox selectedStudent={selectedStudent} onSelect={handleSelect} disabled={disabled} />;
}
