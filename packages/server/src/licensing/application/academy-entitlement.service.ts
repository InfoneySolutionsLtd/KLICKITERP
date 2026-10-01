import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "../../shared/config/app-config.service";
import { decryptFromBuffer } from "../../shared/crypto/aes-gcm.util";
import { AcademyLinkEntity } from "../domain/academy-link.entity";
import { LicenseState } from "../domain/license.entity";
import { AcademyGatewayClient, AcademyEntitlementResponse } from "../infrastructure/academy-gateway.client";
import { AcademyLinkRepository } from "../infrastructure/academy-link.repository";
import { LicenseRepository } from "../infrastructure/license.repository";

const DEFAULT_PLAN = "STANDARD";
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Drives `license.license.state` from the external Academy Gateway's
 * subscription entitlement signal — per the user's own framing: "an active
 * subscription translates to a valid license; no active subscription
 * invalidates it." Once this syncs `license.license.state`, the
 * pre-existing, UNCHANGED `LicenseStateGuard` enforcement pipeline
 * (`shared/rbac/license-state.guard.ts`) does the rest — this service is
 * the only new enforcement-relevant piece; no new guard was added.
 *
 * This is a THIRD channel managing the same singular `license.license` row
 * `LicenseFileService` (file channel) and `LicenseApiService` (Infoney
 * mutual-auth channel) already share — it follows their one shared
 * invariant: never override `DEACTIVATED` (manual, terminal).
 *
 * Runs at boot (`onModuleInit` — both `apps/api` and `apps/worker` mount
 * `LicensingModule`, so this genuinely fires in both processes; a
 * deliberate, harmless duplicate since the operation is idempotent) and
 * periodically via `apps/worker`'s own BullMQ repeatable job
 * (`apps/worker/src/academy/*`).
 */
@Injectable()
export class AcademyEntitlementService implements OnModuleInit {
  private readonly logger = new Logger(AcademyEntitlementService.name);

  constructor(
    private readonly gatewayClient: AcademyGatewayClient,
    private readonly academyLinkRepository: AcademyLinkRepository,
    private readonly licenseRepository: LicenseRepository,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.checkEntitlement();
    } catch (error) {
      this.logger.warn(`Boot-time Academy entitlement check failed: ${(error as Error).message}`);
    }
  }

  async checkEntitlement(): Promise<void> {
    const link = await this.academyLinkRepository.findCurrent();
    if (!link || !link.apiKeyEnc) {
      this.logger.log(
        "Academy Gateway: no API key stored yet — instance not yet onboarded, skipping entitlement check.",
      );
      return;
    }

    const apiKey = decryptFromBuffer(link.apiKeyEnc, this.config.appEncryptionKeyBase64);

    try {
      const entitlement = await this.gatewayClient.getEntitlement(apiKey);
      await this.applySuccess(link, entitlement);
    } catch (error) {
      await this.applyFailure(link, error as Error);
    }
  }

  private async applySuccess(link: AcademyLinkEntity, entitlement: AcademyEntitlementResponse): Promise<void> {
    const now = new Date();
    link.lastEntitlementCheckedAt = now;
    link.lastEntitlementSuccessAt = now;
    link.lastEntitlementAllowed = entitlement.allowed;
    link.lastEntitlementStatus = entitlement.status;
    link.lastEntitlementExpiresAt = entitlement.expiresAt ? new Date(entitlement.expiresAt) : null;
    link.lastEntitlementError = null;
    await this.academyLinkRepository.save(link);

    await this.syncLicenseState(link, entitlement.allowed, entitlement.status, entitlement.expiresAt);
  }

  /**
   * Spec's 3 outage rules, in order: (1) a successful `EXPIRED` response
   * always overrides any grace period — automatically true here, since that
   * arrives via `applySuccess()`, never this method. (2) No successful check
   * ever received -> never activate billing: handled by the early return
   * below. (3) Outage within the configured grace window -> keep relying on
   * whatever state was synced at the last success (no-op); past it ->
   * treat as a fresh `allowed:false`.
   */
  private async applyFailure(link: AcademyLinkEntity, error: Error): Promise<void> {
    const now = new Date();
    link.lastEntitlementCheckedAt = now;
    link.lastEntitlementError = error.message.slice(0, 500);
    await this.academyLinkRepository.save(link);

    this.logger.warn(`Academy entitlement check failed: ${error.message}`);

    if (!link.lastEntitlementSuccessAt) {
      return;
    }

    const graceMs = this.config.academyEntitlementGraceHours * MS_PER_HOUR;
    const withinGrace = now.getTime() - link.lastEntitlementSuccessAt.getTime() <= graceMs;
    if (withinGrace) {
      return;
    }

    await this.syncLicenseState(link, false, "UNREACHABLE", null);
  }

  private async syncLicenseState(
    link: AcademyLinkEntity,
    allowed: boolean,
    status: string,
    expiresAt: string | null,
  ): Promise<void> {
    const existing = await this.licenseRepository.findCurrent();

    if (existing?.state === "DEACTIVATED") {
      return;
    }

    const now = new Date();
    const nextState: LicenseState = allowed ? "ACTIVE" : status === "EXPIRED" ? "EXPIRED" : "SUSPENDED";

    if (!existing) {
      if (!allowed) {
        return;
      }
      await this.licenseRepository.create({
        schoolId: link.academySchoolId ?? "",
        plan: DEFAULT_PLAN,
        features: [],
        validFrom: now.toISOString().slice(0, 10),
        validTo: expiresAt ? expiresAt.slice(0, 10) : now.toISOString().slice(0, 10),
        graceDays: 0,
        state: nextState,
        stateChangedAt: now,
      });
      return;
    }

    if (expiresAt) {
      existing.validTo = expiresAt.slice(0, 10);
    }
    if (existing.state !== nextState) {
      existing.state = nextState;
      existing.stateChangedAt = now;
    }
    await this.licenseRepository.save(existing);
  }
}
