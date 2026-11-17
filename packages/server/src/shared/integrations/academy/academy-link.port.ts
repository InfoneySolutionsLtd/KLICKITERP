/**
 * The ERP's link to the school's Klickit Academy account, as other modules may see it.
 *
 * `licensing` owns the link (school code -> OTP -> `kfe_...` API key, stored encrypted) and is structurally
 * isolated (`module-deps.json`: it may import `shared` only and nothing may import it). Modules that need to call
 * the Academy on the school's behalf (student sync, invoice publishing, ...) therefore depend on THIS port in
 * `shared/`, and `licensing` provides the implementation (`AcademyLinkPortAdapter`).
 */
export const ACADEMY_LINK_PORT = Symbol("ACADEMY_LINK_PORT");

export interface AcademyConnection {
  /** The school's `kfe_...` API key, decrypted. Use it for one request; never log it, return it or store it. */
  apiKey: string;
  academySchoolId: string | null;
  academySchoolCode: string | null;
}

export interface AcademyLinkPort {
  /** `null` until the school has completed Academy onboarding. */
  getConnection(): Promise<AcademyConnection | null>;
}
