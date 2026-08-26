import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

export type TestableCommChannel = "SMS" | "EMAIL" | "PUSH" | "WHATSAPP";

export interface CommsTestConnectionResult {
  ok: boolean;
  message: string;
}

/**
 * Thin wrapper over `CommsTestConnectionController`
 * (`packages/server/src/platform/comms/api/test-connection.controller.ts`)
 * — the REAL Test Connection for SMTP/SMS/FCM/WHATSAPP, genuinely distinct
 * from `platform/settings`' own `testIntegrationConfigConnection()`
 * (`features/settings/api/integration-configs.api.ts`), which stays a
 * permanent stub for these 4 kinds (confirmed by reading
 * `IntegrationConfigService.stubTestFor()` directly — `platform/settings`
 * cannot import `platform/comms`, it would invert the real dependency
 * direction). This one resolves the highest-priority ENABLED
 * `set_integration_config` row of the matching kind via
 * `AdapterResolverService` and calls the real adapter's `testConnection()` —
 * a genuine check (SMTP handshake, FCM credential token fetch, an SMS/
 * WhatsApp gateway reachability probe) when a config is enabled, or
 * `LogOnlyAdapter`'s honest `{ok:false, message:"no adapter configured,
 * using log-only fallback"}` when none is. `channel`, not `kind` — this
 * route is keyed by `CommChannel` (`SMS`/`EMAIL`/`PUSH`/`WHATSAPP`), the
 * SAME enum `CreateTemplateDto` uses, not `IntegrationKind` (`SMTP`/`SMS`/
 * `FCM`/`WHATSAPP`) — `EMAIL` maps to a `kind:"SMTP"` config server-side.
 */
export async function testCommsConnection(channel: TestableCommChannel): Promise<CommsTestConnectionResult> {
  return unwrapApiResult<CommsTestConnectionResult>(
    await apiClient.POST("/api/v1/comms/integrations/test-connection", { body: { channel } }),
  );
}
