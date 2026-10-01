import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Hand-typed request/response shapes, NOT sourced from `@klickit/contracts`
 * — same reason `license.api.ts`'s own doc comment documents for its 3
 * routes: `AcademyIntegrationController` carries no `@ApiOkResponse`
 * decorators either, so the generated `openapi-types.ts` entries for these
 * paths have no usable response schema. Mirrors `packages/server/src/licensing/api/academy-integration.controller.ts`'s
 * own response shapes field-for-field.
 */

export interface AcademyStartOnboardingResponse {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  refId: string;
  expiresInMinutes: number;
  message: string;
  email: string;
  phoneNumber: string;
  emailSent: boolean;
  smsSent: boolean;
}

export interface AcademySchool {
  id: string;
  schoolName: string;
  schoolCode: string;
  schoolType: string;
  schoolStatus: string;
  countryId: string;
  region: string;
  contactEmail: string;
  contactPhone: string;
  configComplete: boolean;
  /** Confirmed live — several fields beyond the original spec doc. All optional: not guaranteed present for every school. */
  schoolWebsite?: string;
  letterHeadUrl?: string;
  docLetterHead?: string;
  baseLetterhead?: string;
  principleName?: string;
  principleEmail?: string;
  principlePhone?: string;
  addressCounty?: string;
  addressCity?: string;
  addressLine?: string;
}

export interface AcademyAdministrator {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AcademyOnboardingVerifyResult {
  school: AcademySchool;
  administrator: AcademyAdministrator;
}

export interface AcademyStatusView {
  connected: boolean;
  academySchoolId: string | null;
  academySchoolCode: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastAllowed: boolean | null;
  lastStatus: string | null;
  lastExpiresAt: string | null;
  lastError: string | null;
}

/** `GET /license/academy/status` — `license:status:view`. Never includes key material. */
export async function getAcademyStatus(): Promise<AcademyStatusView> {
  return unwrapApiResult<AcademyStatusView>(await apiClient.GET("/api/v1/license/academy/status"));
}

/** `POST /license/academy/onboarding/start` — `license:academy:manage`. Submits the school code; Academy sends an OTP by email+SMS. */
export async function startAcademyOnboarding(schoolCode: string): Promise<AcademyStartOnboardingResponse> {
  return unwrapApiResult<AcademyStartOnboardingResponse>(
    await apiClient.POST("/api/v1/license/academy/onboarding/start", { body: { schoolCode } }),
  );
}

/** `POST /license/academy/onboarding/verify` — `license:academy:manage`. The server never returns the raw API key; this response never carries one. */
export async function verifyAcademyOnboarding(
  schoolId: string,
  refId: string,
  code: string,
): Promise<AcademyOnboardingVerifyResult> {
  return unwrapApiResult<AcademyOnboardingVerifyResult>(
    await apiClient.POST("/api/v1/license/academy/onboarding/verify", { body: { schoolId, refId, code } }),
  );
}

/** `POST /license/academy/recheck` — `license:academy:manage`. Forces an immediate entitlement recheck instead of waiting for the next scheduled poll. */
export async function recheckAcademyEntitlement(): Promise<AcademyStatusView> {
  return unwrapApiResult<AcademyStatusView>(await apiClient.POST("/api/v1/license/academy/recheck"));
}

/**
 * The pre-login counterparts to `startAcademyOnboarding()`/`verifyAcademyOnboarding()`
 * above, used only by the first-run setup wizard (`app/(auth)/setup/page.tsx`)
 * — no JWT exists yet, and no `license:academy:manage` permission check
 * applies. The server-side route (`AcademyFirstRunController`) permanently
 * refuses (409) once any System Admin already exists, so these two
 * functions become dead ends after first-run, by design.
 */
export async function startFirstRunOnboarding(schoolCode: string): Promise<AcademyStartOnboardingResponse> {
  return unwrapApiResult<AcademyStartOnboardingResponse>(
    await apiClient.POST("/api/v1/license/academy/first-run/start", { body: { schoolCode } }),
  );
}

export async function verifyFirstRunOnboarding(
  schoolId: string,
  refId: string,
  code: string,
): Promise<AcademyOnboardingVerifyResult> {
  return unwrapApiResult<AcademyOnboardingVerifyResult>(
    await apiClient.POST("/api/v1/license/academy/first-run/verify", { body: { schoolId, refId, code } }),
  );
}
