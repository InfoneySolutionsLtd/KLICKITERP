import { Injectable } from "@nestjs/common";
import { IntegrationConfigService, KcbBuniConfigResolverService, ResolvedKcbBuni } from "../../../platform/settings";
import { KcbBuniApiClient } from "../../../shared/integrations/kcb-buni/kcb-buni-api.client";
import { DarajaAdapter, DarajaConfig } from "./adapters/daraja.adapter";
import { KcbMpesaExpressAdapter } from "./adapters/kcb-mpesa-express.adapter";
import { MpesaLogOnlyAdapter } from "./adapters/mpesa-log-only.adapter";
import { MpesaPort } from "./ports/mpesa.port";

interface CacheEntry {
  configId: string;
  adapter: MpesaPort;
}

/**
 * Resolves the active `MpesaPort` implementation — the exact pattern
 * `platform/comms`' `AdapterResolverService` established, narrowed to a
 * single channel (`kind='MPESA'`). Asks `platform/settings`'
 * `IntegrationConfigService` (public service only, never its repositories —
 * `module-deps.json`'s `domains/payments` entry) for the highest-priority
 * enabled `MPESA` config and constructs a real `DarajaAdapter` from its
 * decrypted credentials. Adapter instance cached by resolved config id,
 * re-resolved the moment the enabled config changes — same caching shape as
 * comms' `resolveSms()`/`resolveMail()`.
 *
 * Order of preference:
 *  1. an enabled `MPESA` (Safaricom Daraja) config;
 *  2. else the school's KCB BUNI config, when it carries what M-Pesa Express needs (its KCB till/account number and
 *     this API's public address) — the STK push is then collected through KCB;
 *  3. else `MpesaLogOnlyAdapter`, so `MpesaService` always has a working (if inert) port.
 */
@Injectable()
export class MpesaAdapterResolverService {
  private cache: CacheEntry | null = null;
  private kcbCache: { resolved: ResolvedKcbBuni; adapter: MpesaPort } | null = null;

  constructor(
    private readonly integrationConfigService: IntegrationConfigService,
    private readonly logOnlyAdapter: MpesaLogOnlyAdapter,
    private readonly kcbBuniResolver: KcbBuniConfigResolverService,
  ) {}

  async resolve(): Promise<MpesaPort> {
    const configs = await this.integrationConfigService.list();
    const enabled = configs.filter((c) => c.kind === "MPESA" && c.isEnabled).sort((a, b) => b.priority - a.priority)[0];
    if (enabled) {
      if (this.cache?.configId === enabled.id) return this.cache.adapter;
      const config = (await this.integrationConfigService.getDecryptedConfig(enabled.id)) as unknown as DarajaConfig;
      const adapter = new DarajaAdapter(config);
      this.cache = { configId: enabled.id, adapter };
      return adapter;
    }
    return (await this.resolveKcb()) ?? this.logOnlyAdapter;
  }

  private async resolveKcb(): Promise<MpesaPort | null> {
    const resolved = await this.kcbBuniResolver.resolve();
    if (!resolved?.config.stkAccountNumber || !resolved.config.callbackBaseUrl) return null;
    // `resolve()` hands back the same object until the saved config changes, so identity is a safe cache key.
    if (this.kcbCache?.resolved === resolved) return this.kcbCache.adapter;
    const adapter = new KcbMpesaExpressAdapter(resolved.config, new KcbBuniApiClient(resolved.config, resolved.tokenProvider));
    this.kcbCache = { resolved, adapter };
    return adapter;
  }
}
