import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { encryptToBuffer } from "../../../shared/crypto/aes-gcm.util";
import { AcademyGatewayException } from "../../../shared/exceptions/academy-gateway.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ACADEMY_LINK_PORT } from "../../../shared/integrations/academy/academy-link.port";
import type { AcademyConnection, AcademyLinkPort } from "../../../shared/integrations/academy/academy-link.port";
import { AcadInboundLinkEntity } from "../domain/acad-inbound-link.entity";
import { AcadInboundLinkRepository } from "../infrastructure/acad-inbound-link.repository";
import { AcademyHttpClient } from "../infrastructure/academy-http.client";
import { decodeAcademySecret } from "./academy-signature";

const MAX_BASE_URL_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 300;

export interface AcademyLinkStatus {
  /** Whether this ERP has completed Academy onboarding (school code + OTP) at all. */
  connected: boolean;
  registered: boolean;
  registeredBaseUrl: string | null;
  registeredAt: Date | null;
  secretVersion: number | null;
  lastVerifiedAt: Date | null;
  lastVerifyOk: boolean | null;
  lastVerifyMessage: string | null;
  lastInboundAt: Date | null;
  /** A starting point for the address field, derived from where the web app is served. The admin confirms it. */
  suggestedBaseUrl: string;
}

/** What `POST erp/link/verify` on the Academy answers: it called our `ping`, signed, and reports how that went. */
interface VerifyReply {
  ok: boolean;
  message?: string;
}

/**
 * Normalises the address an admin typed: `https://erp.school.example/api/v1/` -> `https://erp.school.example/api/v1`.
 * Throws a `ValidationException` (shown to the admin) for anything that cannot be a public API address. `https` is
 * required outside development — the secret-signed calls carry payment details.
 */
export function normalizeBaseUrl(input: string, allowInsecure: boolean): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed || trimmed.length > MAX_BASE_URL_LENGTH) {
    throw new ValidationException("Enter this ERP's public API address, e.g. https://erp.yourschool.ac.ke/api/v1");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ValidationException("That is not a valid web address. Use the full address, e.g. https://erp.yourschool.ac.ke/api/v1");
  }
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) {
    throw new ValidationException("The address must start with https:// — the Academy sends payment details to it.");
  }
  if (url.username || url.password) {
    throw new ValidationException("The address must not contain a user name or password.");
  }
  if (url.search || url.hash) {
    throw new ValidationException("The address must not contain a ? query or # fragment.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * The ERP's half of linking to the Academy so the Academy can CALL the ERP (the parent-portal "pay" flow):
 *
 *  - `register()`: tells the Academy the public address of this ERP's API; the Academy answers with a fresh shared secret
 *    (once). Stored AES-256-GCM encrypted. Registering again replaces the secret — that is how it is rotated.
 *  - `testConnection()`: asks the Academy to call our signed `ping` and report back, so a wrong address, a firewall, a
 *    clock that is out, or a secret mismatch shows up now, with a message, instead of when a parent first taps Pay.
 *
 * Both go out with the school's `X-ERP-API-Key`, through the same retrying client as the student sync.
 */
@Injectable()
export class AcademyLinkService {
  private readonly logger = new Logger(AcademyLinkService.name);

  constructor(
    @Inject(ACADEMY_LINK_PORT) private readonly academyLink: AcademyLinkPort,
    private readonly http: AcademyHttpClient,
    private readonly repository: AcadInboundLinkRepository,
    private readonly config: AppConfigService,
  ) {}

  async getStatus(): Promise<AcademyLinkStatus> {
    const [connection, link] = await Promise.all([this.academyLink.getConnection(), this.repository.findCurrent()]);
    return this.toStatus(connection !== null, link);
  }

  async register(rawBaseUrl: string, actorId: string | null): Promise<AcademyLinkStatus> {
    const baseUrl = normalizeBaseUrl(rawBaseUrl, this.config.nodeEnv !== "production");
    const connection = await this.requireConnection();

    const reply = await this.http.put<{ hmacSecret?: string }>(connection.apiKey, "/erp/link", { erpBaseUrl: baseUrl });
    if (!reply?.hmacSecret || !decodeAcademySecret(reply.hmacSecret)) {
      // Deliberately not including the reply: it may contain the secret.
      throw new AcademyGatewayException("The Academy answered, but not with a usable shared secret. Try again.", null);
    }
    const secretEnc = encryptToBuffer(reply.hmacSecret, this.config.appEncryptionKeyBase64);

    const now = new Date();
    const existing = await this.repository.findCurrent();
    let saved: AcadInboundLinkEntity;
    if (existing) {
      existing.registeredBaseUrl = baseUrl;
      existing.secretEnc = secretEnc;
      existing.secretVersion += 1;
      existing.registeredAt = now;
      existing.registeredBy = actorId;
      existing.lastVerifiedAt = null;
      existing.lastVerifyOk = null;
      existing.lastVerifyMessage = null;
      existing.updatedBy = actorId;
      saved = await this.repository.save(existing);
    } else {
      saved = await this.repository.create({
        registeredBaseUrl: baseUrl,
        secretEnc,
        secretVersion: 1,
        registeredAt: now,
        registeredBy: actorId,
        createdBy: actorId,
        updatedBy: actorId,
      });
    }
    this.logger.log(`Registered this ERP's address with the Academy (secret version ${saved.secretVersion}).`);
    return this.toStatus(true, saved);
  }

  async testConnection(actorId: string | null): Promise<AcademyLinkStatus> {
    const connection = await this.requireConnection();
    const link = await this.repository.findCurrent();
    if (!link) {
      throw new ValidationException("Register this ERP's address with the Academy first.");
    }

    let ok = false;
    let message: string;
    try {
      const reply = await this.http.post<VerifyReply>(connection.apiKey, "/erp/link/verify", {});
      ok = reply?.ok === true;
      message = reply?.message?.trim() || (ok ? "The Academy reached this ERP." : "The Academy could not reach this ERP.");
    } catch (error) {
      message = error instanceof Error ? error.message : "The Academy could not be asked to test the connection.";
    }

    link.lastVerifiedAt = new Date();
    link.lastVerifyOk = ok;
    link.lastVerifyMessage = message.slice(0, MAX_MESSAGE_LENGTH);
    link.updatedBy = actorId;
    return this.toStatus(true, await this.repository.save(link));
  }

  private async requireConnection(): Promise<AcademyConnection> {
    const connection = await this.academyLink.getConnection();
    if (!connection) {
      throw new ValidationException("This ERP is not connected to a Klickit Academy school yet. Connect it on the Licence page first.");
    }
    return connection;
  }

  private toStatus(connected: boolean, link: AcadInboundLinkEntity | null): AcademyLinkStatus {
    return {
      connected,
      registered: link !== null,
      registeredBaseUrl: link?.registeredBaseUrl ?? null,
      registeredAt: link?.registeredAt ?? null,
      secretVersion: link?.secretVersion ?? null,
      lastVerifiedAt: link?.lastVerifiedAt ?? null,
      lastVerifyOk: link?.lastVerifyOk ?? null,
      lastVerifyMessage: link?.lastVerifyMessage ?? null,
      lastInboundAt: link?.lastInboundAt ?? null,
      suggestedBaseUrl: this.suggestedBaseUrl(),
    };
  }

  private suggestedBaseUrl(): string {
    try {
      return `${new URL(this.config.webAppUrl).origin}/api/v1`;
    } catch {
      return "";
    }
  }
}
