import { EntityManager } from "typeorm";
import { SettingsService } from "../../../platform/settings";
import { StdStudentEntity, StdStudentRepository } from "../../students";

/**
 * FR-PAY-009.1 — configurable regex list Settings carries for extracting an admission number out of the free-text
 * reference a payer typed (an M-Pesa C2B `BillRefNumber`, a bank notification's `customerReference`). Each pattern is
 * tried in order; a pattern with a capture group uses group 1 as the candidate admission number, otherwise the whole
 * match is used. Sensible digits-only default (a school admission number is almost always numeric, possibly with a
 * short alpha prefix like `ADM1234`).
 */
export const C2B_BILL_REF_PATTERNS_SETTING_KEY = "payments.c2b_bill_ref_patterns";
export const DEFAULT_C2B_BILL_REF_PATTERNS: readonly string[] = ["^(\\d{3,10})$", "(\\d{3,10})"];

/**
 * The admission number a payment reference refers to: the reference itself when a student has exactly that
 * admission number, otherwise the first configured pattern that matches. `null` when nothing in it looks like one.
 * (The returned candidate is NOT checked to exist — callers look the student up.)
 */
export async function resolveAdmissionNoFromReference(
  studentRepository: StdStudentRepository,
  settingsService: SettingsService,
  reference: string,
  manager?: EntityManager,
): Promise<string | null> {
  const exact = await studentRepository.findByAdmissionNo(reference, manager);
  if (exact) return reference;

  const patterns = await settingsService.getTyped<string[]>(C2B_BILL_REF_PATTERNS_SETTING_KEY, DEFAULT_C2B_BILL_REF_PATTERNS as string[]);
  for (const source of patterns) {
    const match = new RegExp(source).exec(reference);
    if (!match) continue;
    const candidate = match[1] ?? match[0];
    if (candidate) return candidate;
  }
  return null;
}

/** The student a payment reference points at, or `null`. */
export async function findStudentByPaymentReference(
  studentRepository: StdStudentRepository,
  settingsService: SettingsService,
  reference: string,
  manager?: EntityManager,
): Promise<StdStudentEntity | null> {
  const admissionNo = await resolveAdmissionNoFromReference(studentRepository, settingsService, reference, manager);
  return admissionNo ? studentRepository.findByAdmissionNo(admissionNo, manager) : null;
}
