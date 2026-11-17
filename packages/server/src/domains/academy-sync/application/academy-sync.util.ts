import { createHash } from "node:crypto";
import { AcademyStudentDto } from "./academy-sync.types";

export interface SplitName {
  firstName: string;
  middleName: string | null;
  lastName: string;
}

const NAME_PART_MAX = 60; // std_student.first_name / middle_name / last_name are varchar(60)

/**
 * The Academy keeps one `fullName`; the ERP needs first/middle/last. First word = first name, last word = last name,
 * anything between = middle name. A single word cannot be split honestly (the ERP requires a last name), so it returns
 * `null` and the student is reported for the school to fix at the source rather than given an invented surname.
 */
export function splitFullName(fullName: string | null | undefined): SplitName | null {
  const parts = (fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return null;
  }
  const middle = parts.slice(1, -1).join(" ");
  return {
    firstName: parts[0].slice(0, NAME_PART_MAX),
    middleName: middle ? middle.slice(0, NAME_PART_MAX) : null,
    lastName: parts[parts.length - 1].slice(0, NAME_PART_MAX),
  };
}

/**
 * Brings Kenyan mobile numbers to the one local form (`0712345678`) so `+254712345678`, `254712345678` and
 * `712345678` are recognised as the same person — the ERP's guardian de-duplication is an exact string match.
 * Anything that is not recognisably a Kenyan mobile is kept as typed (trimmed, 20 chars max — the column size).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const digits = trimmed.replace(/[\s\-().]/g, "");
  const national = digits.replace(/^\+?254/, "");
  if (/^\+?254\d{9}$/.test(digits) && /^[17]\d{8}$/.test(national)) {
    return `0${national}`;
  }
  if (/^[17]\d{8}$/.test(digits)) {
    return `0${digits}`;
  }
  if (/^0[17]\d{8}$/.test(digits)) {
    return digits;
  }
  return trimmed.slice(0, 20);
}

/** The first whole number in a level name ("Grade 4" -> 4, "Form 2" -> 2), or null — used to order an auto-created class. */
export function levelNumberFromName(levelName: string): number | null {
  const match = /\d+/.exec(levelName);
  return match ? Number(match[0]) : null;
}

/**
 * A stable fingerprint of everything about an Academy student the ERP cares about. An unchanged fingerprint means a
 * re-read of the same record, so there is nothing to apply.
 */
export function fingerprintStudent(student: AcademyStudentDto): string {
  const canonical = {
    n: (student.fullName ?? "").trim(),
    a: (student.admissionNumber ?? "").trim(),
    s: student.status,
    l: student.levelId ?? "",
    r: student.streamId ?? "",
    p: [...student.parents]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((parent) => [
        parent.id,
        `${parent.firstName} ${parent.lastName}`.trim(),
        normalizePhone(parent.phoneNumber) ?? "",
        (parent.email ?? "").trim().toLowerCase(),
        parent.relationship ?? "",
      ]),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** The larger of two Academy `updatedAt` texts (same shape, so plain string comparison orders them). */
export function laterOf(current: string | null, candidate: string | null): string | null {
  if (!candidate) {
    return current;
  }
  return !current || candidate > current ? candidate : current;
}
