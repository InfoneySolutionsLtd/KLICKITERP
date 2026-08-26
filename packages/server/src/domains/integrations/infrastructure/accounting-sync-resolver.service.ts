import { Injectable } from "@nestjs/common";
import { IntegrationConfigService, SetIntegrationConfigEntity, SetIntegrationKind } from "../../../platform/settings";
import { QuickBooksAdapter, QuickBooksConfig } from "./adapters/quickbooks.adapter";
import { SageAdapter, SageConfig } from "./adapters/sage.adapter";
import { SyncLogOnlyAdapter } from "./adapters/sync-log-only.adapter";
import { XeroAdapter, XeroConfig } from "./adapters/xero.adapter";
import { AccountingSyncPort } from "./ports/accounting-sync.port";

export type AccountingSyncKind = Extract<SetIntegrationKind, "QUICKBOOKS" | "XERO" | "SAGE">;

interface CacheEntry {
  configId: string;
  adapter: AccountingSyncPort;
}

/**
 * Given a `kind` (`QUICKBOOKS`/`XERO`/`SAGE`), asks `platform/settings`'
 * `IntegrationConfigService` (its public service, never its repositories —
 * module-deps.json's `domains/integrations` entry) for the highest-priority
 * enabled config of the matching kind and returns the matching real adapter,
 * constructed from the decrypted config. Falls back to `SyncLogOnlyAdapter`
 * when no config of that kind is enabled/configured. Mirrors
 * `platform/comms`' `AdapterResolverService` pattern exactly — adapter
 * instances are cached per kind, keyed by the resolved config's id, so a
 * stable config doesn't pay OAuth-token-cache-construction cost on every
 * single call; re-resolves the moment the enabled config changes.
 */
@Injectable()
export class AccountingSyncResolverService {
  private cache = new Map<AccountingSyncKind, CacheEntry>();

  constructor(
    private readonly integrationConfigService: IntegrationConfigService,
    private readonly syncLogOnlyAdapter: SyncLogOnlyAdapter,
  ) {}

  async resolve(kind: AccountingSyncKind): Promise<AccountingSyncPort> {
    return (await this.resolveWithConfigId(kind)).adapter;
  }

  /**
   * Same resolution as `resolve()`, but also returns which `set_integration_config`
   * row (if any) was actually used — `null` when no config of this kind is
   * enabled and the `SyncLogOnlyAdapter` fallback was returned instead. Added
   * for `AccountingSyncService.testConnection()`, which needs to know the
   * config id to write a real test result back onto (`IntegrationConfigService.recordTestResult()`)
   * — `pushEntity()`'s own use of `resolve()` has no such need and stays unchanged.
   */
  async resolveWithConfigId(kind: AccountingSyncKind): Promise<{ adapter: AccountingSyncPort; configId: string | null }> {
    const enabled = await this.findEnabled(kind);
    if (!enabled) return { adapter: this.syncLogOnlyAdapter, configId: null };

    const cached = this.cache.get(kind);
    if (cached?.configId === enabled.id) return { adapter: cached.adapter, configId: enabled.id };

    const config = await this.integrationConfigService.getDecryptedConfig(enabled.id);
    const adapter = this.build(kind, config);
    this.cache.set(kind, { configId: enabled.id, adapter });
    return { adapter, configId: enabled.id };
  }

  private build(kind: AccountingSyncKind, config: Record<string, unknown>): AccountingSyncPort {
    switch (kind) {
      case "QUICKBOOKS":
        return new QuickBooksAdapter(config as unknown as QuickBooksConfig);
      case "XERO":
        return new XeroAdapter(config as unknown as XeroConfig);
      case "SAGE":
        return new SageAdapter(config as unknown as SageConfig);
      /* istanbul ignore next -- exhaustive over AccountingSyncKind, unreachable at the type level */
      default: {
        const exhaustive: never = kind;
        throw new Error(`Unhandled accounting-sync kind: ${String(exhaustive)}`);
      }
    }
  }

  private async findEnabled(kind: AccountingSyncKind): Promise<SetIntegrationConfigEntity | undefined> {
    const configs = await this.integrationConfigService.list();
    return configs.filter((c) => c.kind === kind && c.isEnabled).sort((a, b) => b.priority - a.priority)[0];
  }
}
