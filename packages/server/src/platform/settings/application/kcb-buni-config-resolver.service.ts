import { KeyObject } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { IntegrationConfigService } from "./integration-config.service";
import { isKcbBuniConfig, KcbBuniConfig, parseKcbBuniConfig } from "../../../shared/integrations/kcb-buni/kcb-buni.config";
import { loadKcbPublicKey } from "../../../shared/integrations/kcb-buni/kcb-ipn-signature";
import { KcbBuniTokenProvider } from "../../../shared/integrations/kcb-buni/kcb-buni-token.provider";

/** Everything a KCB BUNI caller needs, built once per saved config. */
export interface ResolvedKcbBuni {
  configId: string;
  config: KcbBuniConfig;
  /** Shared, caching token source — outbound calls (M-Pesa Express, Funds Transfer) borrow tokens from here. */
  tokenProvider: KcbBuniTokenProvider;
  /** KCB's public key, parsed once; `null` when none was configured. */
  ipnPublicKey: KeyObject | null;
}

/**
 * Finds the school's KCB BUNI settings: the highest-priority ENABLED `set_integration_config` row of `kind='BANK'`
 * whose decrypted JSON says `provider: "KCB_BUNI"` (a `BANK` row without it is the generic HTTP statement-feed
 * config, left alone). Same resolver shape as `MpesaAdapterResolverService` — public `IntegrationConfigService` only.
 *
 * The built object (parsed config, token provider with its cached token, parsed public key) is cached per
 * `<config id>:<row version>`, so saving an edited config in Settings → Integrations takes effect on the next
 * request instead of needing a restart.
 */
@Injectable()
export class KcbBuniConfigResolverService {
  private cache: { key: string; resolved: ResolvedKcbBuni } | null = null;

  constructor(private readonly integrationConfigService: IntegrationConfigService) {}

  /** `null` when no enabled KCB BUNI config exists. Throws a `ValidationException` naming the bad field when one exists but is incomplete. */
  async resolve(): Promise<ResolvedKcbBuni | null> {
    const rows = (await this.integrationConfigService.list())
      .filter((row) => row.kind === "BANK" && row.isEnabled)
      .sort((a, b) => b.priority - a.priority);

    for (const row of rows) {
      const cacheKey = `${row.id}:${row.version}`;
      if (this.cache?.key === cacheKey) return this.cache.resolved;

      const decrypted = await this.integrationConfigService.getDecryptedConfig(row.id);
      if (!isKcbBuniConfig(decrypted)) continue;

      const config = parseKcbBuniConfig(decrypted);
      const resolved: ResolvedKcbBuni = {
        configId: row.id,
        config,
        tokenProvider: new KcbBuniTokenProvider(config),
        ipnPublicKey: config.ipnPublicKeyPem ? loadKcbPublicKey(config.ipnPublicKeyPem) : null,
      };
      this.cache = { key: cacheKey, resolved };
      return resolved;
    }
    return null;
  }
}
