import { Injectable } from "@nestjs/common";
import { IntegrationConfigService } from "../../../platform/settings";
import { GenericHttpBankFeedAdapter, GenericHttpBankFeedConfig } from "./adapters/generic-http-bank-feed.adapter";
import { BankStatementPort } from "./ports/bank-statement.port";

interface CacheEntry {
  configId: string;
  adapter: BankStatementPort;
}

/**
 * Given a `bank_account` id, resolves the enabled `kind='BANK'`
 * `set_integration_config` row whose own decrypted `config.accountId`
 * matches it, and returns a real `GenericHttpBankFeedAdapter` built from
 * that config. Mirrors `AccountingSyncResolverService`'s exact pattern
 * (the same resolve-by-highest-priority-enabled-config-per-kind shape
 * `platform/comms`/`domains/payments`/`domains/integrations` all already
 * established) with ONE necessary difference: those resolvers match purely
 * on `kind` (one enabled config wins per kind, system-wide); this one ALSO
 * filters by the target account, since a school can have multiple bank
 * accounts each needing a different feed, and `set_integration_config` has
 * no `bank_account_id` DB column to filter on directly — every enabled
 * `BANK` config must be decrypted and checked. `domains/banking` already has
 * `platform/settings` in its `module-deps.json` `mayImport` list (added
 * defensively, previously unused) — this is the first real use.
 *
 * Returns `null` (not a log-only fallback) when no matching config exists —
 * unlike `platform/comms`/`domains/integrations`, there is no honest "no
 * feed configured" adapter to return here; the caller (`BankFeedImportService`)
 * turns a `null` into a clear, real error rather than silently no-op-ing,
 * since "fetch now" is always a deliberate, explicit action (manual click or
 * scheduled job iterating ACTUALLY-configured accounts), never a fallback
 * path something else degrades into.
 */
@Injectable()
export class BankFeedAdapterResolverService {
  private cache = new Map<string, CacheEntry>();

  constructor(private readonly integrationConfigService: IntegrationConfigService) {}

  async resolveForAccount(accountId: string): Promise<{ adapter: BankStatementPort; configId: string } | null> {
    const cached = this.cache.get(accountId);

    const enabledBankConfigs = (await this.integrationConfigService.list())
      .filter((c) => c.kind === "BANK" && c.isEnabled)
      .sort((a, b) => b.priority - a.priority);

    for (const config of enabledBankConfigs) {
      if (cached?.configId === config.id) {
        return { adapter: cached.adapter, configId: config.id };
      }
      const decrypted = await this.integrationConfigService.getDecryptedConfig(config.id);
      if (decrypted.accountId !== accountId) continue;

      const adapter = new GenericHttpBankFeedAdapter(decrypted as unknown as GenericHttpBankFeedConfig);
      this.cache.set(accountId, { configId: config.id, adapter });
      return { adapter, configId: config.id };
    }

    return null;
  }
}
