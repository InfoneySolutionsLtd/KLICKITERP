/** The fields a student's display label is built from — satisfied by `StdStudentEntity`. */
export interface StudentLabelFields {
  firstName: string;
  lastName: string;
  admissionNo: string;
}

/**
 * "First Last (admission no.)" — the same label the web's student pickers show,
 * so a name in a batch-billing result reads exactly like the one the accountant
 * just clicked. Batch results carry this as an OPTIONAL `studentLabel` next to
 * each `studentId`; the UI falls back to the id only if it is missing.
 */
export function formatStudentLabel(student: StudentLabelFields): string {
  return `${student.firstName} ${student.lastName} (${student.admissionNo})`;
}
