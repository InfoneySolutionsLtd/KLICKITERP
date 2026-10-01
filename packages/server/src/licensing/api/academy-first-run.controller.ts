import { Body, Controller, Post } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import { ConflictException } from "../../shared/exceptions/conflict.exception";
import { ExemptFromLicenseGuard } from "../../shared/rbac/exempt-from-license-guard.decorator";
import { Public } from "../../shared/rbac/public.decorator";
import { isFirstRunSetupComplete } from "../../shared/rbac/first-run-setup.util";
import { AcademyOnboardingService, AcademyOnboardingVerifyResult } from "../application/academy-onboarding.service";
import { AcademyStartOnboardingResponse } from "../infrastructure/academy-gateway.client";
import { StartAcademyOnboardingDto, VerifyAcademyOnboardingDto } from "./dto/academy-onboarding.dto";

/**
 * The pre-login counterpart to `AcademyIntegrationController`'s authenticated
 * `/license/academy/onboarding/{start,verify}` routes (`license:academy:manage`,
 * used for an ALREADY-set-up instance's "reconnect/rotate key" case). These
 * two routes exist purely to let the pre-login first-run setup wizard
 * (`platform/auth`'s `FirstRunSetupService` owns the rest of that journey —
 * `licensing` cannot import it, nor vice versa, both correctly isolated)
 * drive the SAME underlying `AcademyOnboardingService.start()`/`.verify()`
 * before any session/JWT exists at all.
 *
 * Deliberately a SEPARATE controller/route pair rather than making the
 * existing authenticated routes conditionally public: NestJS's global guard
 * pipeline (`JwtAuthGuard` -> `LicenseStateGuard` -> `PermissionsGuard` ->
 * `AuthorityGuard`) can't express "public pre-setup, permissioned
 * post-setup" on one statically-decorated route. Both routes refuse (409)
 * the instant `isFirstRunSetupComplete()` says a System Admin already
 * exists — permanently closing this public path once first-run is done,
 * the same "no redo" invariant `FirstRunSetupService.completeSetup()`
 * independently enforces on its own side of the journey. This is a
 * deliberate widening of the attack surface while NO admin exists yet —
 * the same trust model `tools/bootstrap-admin.ts` already has (whoever
 * reaches the instance first wins), just reachable over HTTP instead of
 * requiring shell access.
 */
@ApiTags("license-academy-first-run")
@Controller("license/academy/first-run")
export class AcademyFirstRunController {
  constructor(
    private readonly onboardingService: AcademyOnboardingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post("start")
  @Public()
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "Pre-login: start Academy onboarding for a never-before-set-up instance" })
  async start(@Body() dto: StartAcademyOnboardingDto): Promise<AcademyStartOnboardingResponse> {
    await this.refuseIfAlreadySetUp();
    return this.onboardingService.start(dto.schoolCode);
  }

  @Post("verify")
  @Public()
  @ExemptFromLicenseGuard()
  @ApiOperation({ summary: "Pre-login: verify the OTP, store the API key — never returns it" })
  async verify(@Body() dto: VerifyAcademyOnboardingDto): Promise<AcademyOnboardingVerifyResult> {
    await this.refuseIfAlreadySetUp();
    return this.onboardingService.verify(dto.schoolId, dto.refId, dto.code);
  }

  private async refuseIfAlreadySetUp(): Promise<void> {
    if (await isFirstRunSetupComplete(this.dataSource)) {
      throw new ConflictException("This instance has already been set up");
    }
  }
}
