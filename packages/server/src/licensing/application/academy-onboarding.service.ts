import { Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../../shared/config/app-config.service";
import { encryptToBuffer } from "../../shared/crypto/aes-gcm.util";
import {
  AcademyGatewayClient,
  AcademyStartOnboardingResponse,
  AcademyVerifyOnboardingResponse,
} from "../infrastructure/academy-gateway.client";
import { AcademyLinkRepository } from "../infrastructure/academy-link.repository";
import { AcademyEntitlementService } from "./academy-entitlement.service";

export interface AcademyOnboardingVerifyResult {
  school: AcademyVerifyOnboardingResponse["school"];
  administrator: AcademyVerifyOnboardingResponse["administrator"];
}

/**
 * The two-step school-code -> OTP onboarding flow against the Academy
 * Gateway. `verify()` deliberately returns only `{school, administrator}`
 * to its own caller — the raw `apiKey` Academy returns is encrypted and
 * persisted here and NEVER forwarded upward, per the spec's "do not log it,
 * display it after setup, or send it to the browser."
 */
@Injectable()
export class AcademyOnboardingService {
  private readonly logger = new Logger(AcademyOnboardingService.name);

  constructor(
    private readonly gatewayClient: AcademyGatewayClient,
    private readonly academyLinkRepository: AcademyLinkRepository,
    private readonly config: AppConfigService,
    private readonly entitlementService: AcademyEntitlementService,
  ) {}

  /** Store `schoolId`/`refId`; never the OTP — there is nothing OTP-shaped in this response to store. */
  async start(schoolCode: string): Promise<AcademyStartOnboardingResponse> {
    const response = await this.gatewayClient.startOnboarding(schoolCode);
    const link = await this.academyLinkRepository.findCurrentOrCreate();
    link.pendingRefId = response.refId;
    await this.academyLinkRepository.save(link);
    return response;
  }

  async verify(schoolId: string, refId: string, code: string): Promise<AcademyOnboardingVerifyResult> {
    const response = await this.gatewayClient.verifyOnboarding(schoolId, refId, code);

    const link = await this.academyLinkRepository.findCurrentOrCreate();
    link.academySchoolId = response.school.id;
    link.academySchoolCode = response.school.schoolCode;
    link.apiKeyId = this.extractKeyId(response.apiKey);
    link.apiKeyEnc = encryptToBuffer(response.apiKey, this.config.appEncryptionKeyBase64);
    link.pendingRefId = null;
    await this.academyLinkRepository.save(link);

    // Best-effort — onboarding itself already succeeded; don't make the admin wait up to
    // academyEntitlementPollIntervalMinutes to see license.license reflect reality. A failure here
    // is logged, not thrown — the next scheduled poll will pick it up.
    this.entitlementService.checkEntitlement().catch((error: Error) => {
      this.logger.warn(`Post-onboarding entitlement check failed (next scheduled poll will retry): ${error.message}`);
    });

    return { school: response.school, administrator: response.administrator };
  }

  /** `"kfe_<key-id>_<secret>"` — keep everything but the trailing secret segment, for display only. */
  private extractKeyId(apiKey: string): string | null {
    const parts = apiKey.split("_");
    if (parts.length < 3) {
      return null;
    }
    return parts.slice(0, -1).join("_");
  }
}
