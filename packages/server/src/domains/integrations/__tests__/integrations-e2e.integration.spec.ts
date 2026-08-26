import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { runInTransaction } from "../../../shared/database/tx";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { IntegrationConfigService } from "../../../platform/settings/application/integration-config.service";
import { SetIntegrationConfigRepository } from "../../../platform/settings/infrastructure/set-integration-config.repository";
import { SetIntegrationConfigEntity } from "../../../platform/settings/domain/set-integration-config.entity";
import { NotificationsService } from "../../../platform/comms";
import { IntgWebhookSubscriptionEntity } from "../domain/intg-webhook-subscription.entity";
import { IntgWebhookDeliveryEntity } from "../domain/intg-webhook-delivery.entity";
import { IntgSyncLogEntity } from "../domain/intg-sync-log.entity";
import { IntgWebhookSubscriptionRepository } from "../infrastructure/intg-webhook-subscription.repository";
import { IntgWebhookDeliveryRepository } from "../infrastructure/intg-webhook-delivery.repository";
import { IntgSyncLogRepository } from "../infrastructure/intg-sync-log.repository";
import { AccountingSyncResolverService } from "../infrastructure/accounting-sync-resolver.service";
import { SyncLogOnlyAdapter } from "../infrastructure/adapters/sync-log-only.adapter";
import { WebhookHttpClient } from "../infrastructure/webhook-http-client";
import { WebhookSubscriptionsService } from "../application/webhook-subscriptions.service";
import { WebhookDeliveryService } from "../application/webhook-delivery.service";
import { AccountingSyncService } from "../application/accounting-sync.service";

/**
 * Module 19 (Integrations) capstone integration test — mirrors
 * `domains/wallet/__tests__/wallet-e2e.integration.spec.ts`'s pattern (real
 * repository/service instances, no Nest DI, self-skips without a reachable
 * Postgres). Covers exactly what the task brief calls out: create a
 * subscription, dispatch an event, verify a delivery row is queued, and a
 * sync-log round trip (accounting-sync push against the SyncLogOnlyAdapter
 * fallback — actively ENFORCED, not assumed: this test temporarily disables
 * any ambient enabled QUICKBOOKS/XERO/SAGE config for its own duration,
 * restored in the `finally` block below, rather than trusting the dev DB
 * happens to have none, after a real leftover config from manual QA once
 * made this test nondeterministically pick the REAL adapter instead and
 * fail against a real, dummy-credentialed OAuth call).
 * `WebhookDeliveryService.attemptDelivery()`'s real HTTP
 * POST/HMAC-signature path is exercised in `webhook-delivery.service.spec.ts`
 * against an injected mock `WebhookHttpClient` instead — no outbound network
 * is available in this environment either way (docs/phase-5/PROGRESS.md
 * "Environment status"), so this integration test only exercises `dispatch()`
 * (a pure DB write, no HTTP call).
 */
describe("integrations module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(`[integrations-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "create subscription -> dispatch() queues a delivery; AccountingSyncService.pushEntity() round-trips a real intg_sync_log row",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[integrations-e2e.integration.spec] SKIPPED (no DB) — end-to-end integrations capstone flow");
        return; // vacuous pass — the skip decision is only known async, after `it()` registration.
      }
      const source = dataSource;
      const config = new AppConfigService();

      const webhookSubscriptionRepository = new IntgWebhookSubscriptionRepository(
        source.getRepository(IntgWebhookSubscriptionEntity) as never,
      );
      const webhookDeliveryRepository = new IntgWebhookDeliveryRepository(source.getRepository(IntgWebhookDeliveryEntity) as never);
      const syncLogRepository = new IntgSyncLogRepository(source.getRepository(IntgSyncLogEntity) as never);
      const integrationConfigRepository = new SetIntegrationConfigRepository(source.getRepository(SetIntegrationConfigEntity) as never);
      const integrationConfigService = new IntegrationConfigService(integrationConfigRepository, config);

      const webhookSubscriptionsService = new WebhookSubscriptionsService(webhookSubscriptionRepository, config);
      const webhookDeliveryService = new WebhookDeliveryService(
        webhookSubscriptionRepository,
        webhookDeliveryRepository,
        webhookSubscriptionsService,
        {} as unknown as NotificationsService, // never invoked — dispatch() never fails/disables
        config,
        {} as unknown as WebhookHttpClient, // never invoked — dispatch() makes no HTTP call
      );

      const syncLogOnlyAdapter = new SyncLogOnlyAdapter();
      const resolver = new AccountingSyncResolverService(integrationConfigService, syncLogOnlyAdapter);
      const accountingSyncService = new AccountingSyncService(resolver, syncLogRepository, integrationConfigService);

      const eventType = `TEST_EVENT_${Date.now()}`;
      let subscription: IntgWebhookSubscriptionEntity | null = null;

      // This assertion below depends on the SyncLogOnlyAdapter fallback (no
      // enabled QUICKBOOKS/XERO/SAGE config) — that's ambient DB state this
      // test does NOT own, not something it can assume. Temporarily disable
      // any currently-enabled config of those 3 kinds for the duration of
      // this test, restoring each one's original isEnabled in the `finally`
      // block below, alongside the existing webhook-row cleanup. Without
      // this, a real config created via the Settings UI for manual QA (e.g.
      // Phase 6 Slice 11 Part 4's own verification) makes this test flip to
      // FAILED the moment AccountingSyncResolverService picks the real
      // adapter instead — this happened for real and is exactly what this
      // block prevents from happening again.
      const ambientEnabledConfigs = (await integrationConfigService.list()).filter(
        (c) => (c.kind === "QUICKBOOKS" || c.kind === "XERO" || c.kind === "SAGE") && c.isEnabled,
      );
      for (const c of ambientEnabledConfigs) {
        await integrationConfigService.update(c.id, { isEnabled: false }, null);
      }

      try {
        subscription = await webhookSubscriptionsService.create(
          { url: "https://example.com/webhooks/klickit-e2e", secret: "e2e-test-secret", events: [eventType] },
          null,
        );
        expect(subscription.isActive).toBe(true);
        expect(subscription.secretEnc).toBeInstanceOf(Buffer);

        const deliveries = await runInTransaction(source, (manager) =>
          webhookDeliveryService.dispatch(manager, eventType, { hello: "world" }),
        );
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0].status).toBe("PENDING");
        expect(deliveries[0].subscriptionId).toBe(subscription.id);

        const [persistedDeliveries] = await webhookDeliveryRepository.list({ subscriptionId: subscription.id });
        expect(persistedDeliveries).toHaveLength(1);
        expect(persistedDeliveries[0].eventType).toBe(eventType);

        const dueRows = await webhookDeliveryRepository.findDueForRetry(new Date());
        expect(dueRows.some((row) => row.id === deliveries[0].id)).toBe(true);

        const logRow = await runInTransaction(source, (manager) =>
          accountingSyncService.pushEntity(manager, {
            kind: "QUICKBOOKS",
            entityType: "INVOICE",
            entityId: subscription!.id, // reuse a real uuid for the FK-less entity_id column
            payload: { note: "integration test push" },
          }),
        );
        expect(logRow.status).toBe("SUCCESS");
        expect(logRow.providerRef).toMatch(/^log-/);

        const [logRows] = await accountingSyncService.listLog({ kind: "QUICKBOOKS" });
        expect(logRows.some((row) => row.id === logRow.id)).toBe(true);
      } finally {
        if (subscription) {
          await source.getRepository(IntgWebhookDeliveryEntity).delete({ subscriptionId: subscription.id });
          await source.getRepository(IntgWebhookSubscriptionEntity).delete({ id: subscription.id });
        }
        for (const c of ambientEnabledConfigs) {
          await integrationConfigService.update(c.id, { isEnabled: true }, null);
        }
      }
    },
    30_000,
  );
});
