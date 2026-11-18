import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { decryptFromBuffer } from "../../../shared/crypto/aes-gcm.util";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { ACADEMY_LINK_PORT } from "../../../shared/integrations/academy/academy-link.port";
import type { AcademyLinkPort } from "../../../shared/integrations/academy/academy-link.port";
import {
  ACADEMY_HEADER_NONCE,
  ACADEMY_HEADER_SCHOOL,
  ACADEMY_HEADER_SIGNATURE,
  ACADEMY_HEADER_TIMESTAMP,
  ACADEMY_MAX_CLOCK_SKEW_SECONDS,
  ACADEMY_NONCE_PATTERN,
  decodeAcademySecret,
  verifySignature,
} from "../application/academy-signature";
import { AcadInboundLinkRepository } from "../infrastructure/acad-inbound-link.repository";

interface InboundRequest {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  academyInbound?: { schoolId: string };
}

const REPLAY_KEY_PREFIX = "academy:inbound:nonce:";

/**
 * Authenticates a call the Klickit Academy makes TO this ERP (`/api/v1/academy/inbound/*`). Those routes are `@Public()`
 * (the Academy holds no user token of its own); this guard is the whole authentication, and it is applied per controller.
 *
 * It accepts a request only if ALL of these hold, checked cheapest-first:
 *   1. all four `X-Klickit-*` headers are present and well-formed;
 *   2. the timestamp is within 5 minutes of now (either way);
 *   3. this ERP has registered with the Academy, and the school header names the school it is linked to;
 *   4. the HMAC over method + path + body + timestamp + nonce verifies with the registered secret (constant-time);
 *   5. the nonce has not been seen before — consumed LAST, and only for a request that already verified, so nobody can
 *      burn nonces they cannot sign for. Redis `SET NX EX`, the same idiom the licence JWS replay-cache uses.
 *
 * Every failure is the same 401 "Invalid request signature": the caller learns nothing about which check failed (the
 * specific reason is logged server-side, never the secret or the signature). The signed path is `req.originalUrl`, i.e.
 * the path as this process received it, so a reverse proxy must forward `/api/v1/...` unchanged.
 */
@Injectable()
export class AcademyInboundGuard implements CanActivate {
  private readonly logger = new Logger(AcademyInboundGuard.name);

  constructor(
    private readonly linkRepository: AcadInboundLinkRepository,
    @Inject(ACADEMY_LINK_PORT) private readonly academyLink: AcademyLinkPort,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<InboundRequest>();
    const header = (name: string): string | undefined => {
      const value = request.headers[name];
      return (Array.isArray(value) ? value[0] : value)?.trim();
    };
    const reject = (reason: string): never => {
      this.logger.warn(`Academy inbound call rejected (${reason}): ${request.method} ${request.originalUrl.split("?")[0]}`);
      throw new AuthenticationException("Invalid request signature");
    };

    const school = header(ACADEMY_HEADER_SCHOOL);
    const timestamp = header(ACADEMY_HEADER_TIMESTAMP);
    const nonce = header(ACADEMY_HEADER_NONCE);
    const signature = header(ACADEMY_HEADER_SIGNATURE);
    if (!school || !timestamp || !nonce || !signature) {
      return reject("missing header");
    }
    if (!ACADEMY_NONCE_PATTERN.test(nonce) || !/^\d{9,12}$/.test(timestamp)) {
      return reject("malformed header");
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > ACADEMY_MAX_CLOCK_SKEW_SECONDS) {
      return reject("timestamp outside the allowed window");
    }

    const link = await this.linkRepository.findCurrent();
    if (!link) {
      return reject("this ERP has not registered with the Academy");
    }
    const connection = await this.academyLink.getConnection();
    if (!connection?.academySchoolId || connection.academySchoolId !== school) {
      return reject("school id does not match the linked school");
    }

    const secret = decodeAcademySecret(decryptFromBuffer(link.secretEnc, this.config.appEncryptionKeyBase64));
    if (!secret) {
      return reject("stored secret is unusable");
    }
    const body = request.rawBody ?? Buffer.alloc(0);
    if (request.method !== "GET" && request.method !== "HEAD" && !request.rawBody) {
      return reject("body bytes unavailable");
    }
    if (!verifySignature(secret, { timestamp, nonce, method: request.method, pathAndQuery: request.originalUrl, body }, signature)) {
      return reject("signature mismatch");
    }

    const fresh = await this.redis.set(`${REPLAY_KEY_PREFIX}${nonce}`, "1", "EX", ACADEMY_MAX_CLOCK_SKEW_SECONDS * 2, "NX");
    if (fresh !== "OK") {
      return reject("nonce already used (replay)");
    }

    request.academyInbound = { schoolId: school };
    // Not awaited on the request path: a bookkeeping write must never fail a signed call.
    this.linkRepository.touchInbound(new Date()).catch((error: Error) => this.logger.warn(`Could not record the inbound call time: ${error.message}`));
    return true;
  }
}
