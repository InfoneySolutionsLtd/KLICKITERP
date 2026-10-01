import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ExemptFromLicenseGuard } from "../../shared/rbac/exempt-from-license-guard.decorator";
import { RequirePermission } from "../../shared/rbac/require-permission.decorator";
import { AcademyEntitlementService } from "../application/academy-entitlement.service";
import { AcademyOnboardingService, AcademyOnboardingVerifyResult } from "../application/academy-onboarding.service";
import { AcademyStartOnboardingResponse } from "../infrastructure/academy-gateway.client";
import { AcademyLinkRepository } from "../infrastructure/academy-link.repository";
import { StartAcademyOnboardingDto, VerifyAcademyOnboardingDto } from "./dto/academy-onboarding.dto";

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

/**
 * Staff-facing surface for the Academy Gateway integration — normal JWT +
 * Permissions pipeline (unlike `LicenseApiController`'s JWS mutual-auth;
 * this is a System Admin driving onboarding from inside the app, not an
 * external portal calling in).
 *
 * The two `POST` onboarding routes are deliberately `@ExemptFromLicenseGuard()`
 * (same decorator `LicenseApiController` already uses): if Academy ever
 * reports `allowed:false` and this ERP's own license flips to `SUSPENDED`
 * (which blocks all non-GET requests), an admin must still be able to
 * re-run onboarding / rotate the key to recover — the same licensing-
 * bootstrap recovery path that decorator exists for. `GET /status` is
 * deliberately NOT exempt — reads are already unblocked by
 * `MUTATION_BLOCKING_STATES` only checking non-GET methods, matching
 * `LicenseStatusController`'s own existing, deliberate choice.
 */
@ApiTags("license-academy")
@Controller("license/academy")
export class AcademyIntegrationController {
  constructor(
    private readonly onboardingService: AcademyOnboardingService,
    private readonly entitlementService: AcademyEntitlementService,
    private readonly academyLinkRepository: AcademyLinkRepository,
  ) {}

  @Post("onboarding/start")
  @RequirePermission("license:academy:manage")
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "Start Academy onboarding — submit the school code, Academy sends an OTP" })
  async start(@Body() dto: StartAcademyOnboardingDto): Promise<AcademyStartOnboardingResponse> {
    return this.onboardingService.start(dto.schoolCode);
  }

  @Post("onboarding/verify")
  @RequirePermission("license:academy:manage")
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "Verify Academy onboarding with the delivered OTP — stores the returned API key, never returns it" })
  async verify(@Body() dto: VerifyAcademyOnboardingDto): Promise<AcademyOnboardingVerifyResult> {
    return this.onboardingService.verify(dto.schoolId, dto.refId, dto.code);
  }

  @Get("status")
  @RequirePermission("license:status:view")
  @ApiOperation({ summary: "Academy connection + last entitlement check result — never includes key material" })
  async status(): Promise<AcademyStatusView> {
    const link = await this.academyLinkRepository.findCurrent();
    return {
      connected: Boolean(link?.apiKeyEnc),
      academySchoolId: link?.academySchoolId ?? null,
      academySchoolCode: link?.academySchoolCode ?? null,
      lastCheckedAt: link?.lastEntitlementCheckedAt?.toISOString() ?? null,
      lastSuccessAt: link?.lastEntitlementSuccessAt?.toISOString() ?? null,
      lastAllowed: link?.lastEntitlementAllowed ?? null,
      lastStatus: link?.lastEntitlementStatus ?? null,
      lastExpiresAt: link?.lastEntitlementExpiresAt?.toISOString() ?? null,
      lastError: link?.lastEntitlementError ?? null,
    };
  }

  @Post("recheck")
  @RequirePermission("license:academy:manage")
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "Force an immediate entitlement recheck, instead of waiting for the next scheduled poll" })
  async recheck(): Promise<AcademyStatusView> {
    await this.entitlementService.checkEntitlement();
    return this.status();
  }
}
