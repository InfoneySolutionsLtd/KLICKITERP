/**
 * The shapes of the Academy Gateway's student export (`GET erp/students`, `GET erp/structure` — see
 * klickit-academy-school-service `src/api/erp-sync/erp-sync.dto.ts`). Kept as plain interfaces: the data is read once,
 * normalised immediately and never exposed to the ERP's own API as-is.
 */
export interface AcademyParentDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  relationship: string | null;
  status: string;
}

export interface AcademyStudentDto {
  id: string;
  fullName: string;
  admissionNumber: string | null;
  /** ACTIVE | INACTIVE | ALUMNI */
  status: string;
  gender: string | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  levelId: string | null;
  levelName: string | null;
  streamId: string | null;
  streamName: string | null;
  accountType: string;
  parents: AcademyParentDto[];
  /** The Academy database's own timestamp text with a `Z` — an opaque, ordered change marker, not a display time. */
  updatedAt: string;
  deletedAt: string | null;
}

export interface AcademyStudentPageDto {
  items: AcademyStudentDto[];
  nextCursor: string | null;
  serverTime: string;
}

export interface AcademyStructureDto {
  levels: Array<{ id: string; name: string; studentCount: number }>;
  streams: Array<{ id: string; name: string; levelId: string | null; levelName: string | null; studentCount: number }>;
}
