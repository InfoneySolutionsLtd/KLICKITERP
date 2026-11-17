import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../shared/config/app-config.service";
import { decryptFromBuffer } from "../../shared/crypto/aes-gcm.util";
import type { AcademyConnection, AcademyLinkPort } from "../../shared/integrations/academy/academy-link.port";
import { AcademyLinkRepository } from "../infrastructure/academy-link.repository";

/** `licensing`'s implementation of the shared `AcademyLinkPort` — hands out the decrypted key, nothing else. */
@Injectable()
export class AcademyLinkPortAdapter implements AcademyLinkPort {
  constructor(
    private readonly academyLinkRepository: AcademyLinkRepository,
    private readonly config: AppConfigService,
  ) {}

  async getConnection(): Promise<AcademyConnection | null> {
    const link = await this.academyLinkRepository.findCurrent();
    if (!link?.apiKeyEnc) {
      return null;
    }
    return {
      apiKey: decryptFromBuffer(link.apiKeyEnc, this.config.appEncryptionKeyBase64),
      academySchoolId: link.academySchoolId,
      academySchoolCode: link.academySchoolCode,
    };
  }
}
