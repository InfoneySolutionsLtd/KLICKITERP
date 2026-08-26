import { Injectable } from "@nestjs/common";
import { IntegrationConfigService, SetIntegrationConfigEntity, SetIntegrationKind } from "../../settings";
import { CommChannel } from "../domain/comm-template.entity";
import { FcmPushAdapter, FcmPushConfig } from "./adapters/fcm-push.adapter";
import { GenericHttpSmsAdapter, GenericHttpSmsConfig } from "./adapters/generic-http-sms.adapter";
import { LogOnlyAdapter } from "./adapters/log-only.adapter";
import { SmtpMailAdapter, SmtpMailConfig } from "./adapters/smtp-mail.adapter";
import { MailPort } from "./ports/mail.port";
import { PushPort } from "./ports/push.port";
import { SmsPort } from "./ports/sms.port";

interface CacheEntry<TPort> {
  configId: string;
  adapter: TPort;
}

interface ResolvedAdapter<TPort> {
  adapter: TPort;
  configId: string | null;
}

/**
 * Given a channel, asks `platform/settings`' `IntegrationConfigService` (its
 * public service, never its repositories — module-deps.json's
 * `platform/comms` entry) for the highest-priority enabled config of the
 * matching kind (SMS -> SMS, EMAIL -> SMTP, PUSH -> FCM, WHATSAPP -> WHATSAPP,
 * per docs/phase-3/02-communication-authentication.md §1.5) and returns the
 * matching real adapter, constructed from the decrypted config. Falls back
 * to `LogOnlyAdapter` when no config of that kind is enabled/configured, or
 * for INAPP (no outbound transport exists for it at all — it's read
 * entirely from `comm_message` rows by the future WebSocket/notification-
 * badge consumer). WHATSAPP resolves to the SAME `GenericHttpSmsAdapter`
 * class SMS uses (see `resolveWhatsapp()`'s own doc comment for why no
 * separate adapter class was needed) — WhatsApp is no longer "reserved".
 *
 * Adapter instances are cached per channel, keyed by the resolved config's
 * id, so a stable config doesn't pay SMTP-transporter/Firebase-app
 * construction cost on every single send; re-resolves (and disposes the
 * outgoing `FcmPushAdapter`'s Firebase app, if any) the moment the enabled
 * config changes.
 */
@Injectable()
export class AdapterResolverService {
  private smsCache: CacheEntry<SmsPort> | null = null;
  private mailCache: CacheEntry<MailPort> | null = null;
  private pushCache: CacheEntry<PushPort> | null = null;
  private whatsappCache: CacheEntry<SmsPort> | null = null;

  constructor(
    private readonly integrationConfigService: IntegrationConfigService,
    private readonly logOnlyAdapter: LogOnlyAdapter,
  ) {}

  async resolve(channel: CommChannel): Promise<SmsPort | MailPort | PushPort> {
    return (await this.resolveWithConfigId(channel)).adapter;
  }

  /**
   * Same resolution as `resolve()`, but also returns which
   * `set_integration_config` row (if any) was actually used — `null` when no
   * config of this kind is enabled and the `LogOnlyAdapter` fallback was
   * returned instead. Added for the real comms Test Connection route
   * (`CommsTestConnectionController`), which needs to know the config id to
   * write a real test result back onto it (`IntegrationConfigService.recordTestResult()`)
   * — every existing `NotificationsService.send()` call via plain `resolve()`
   * has no such need and is unaffected.
   */
  async resolveWithConfigId(channel: CommChannel): Promise<ResolvedAdapter<SmsPort | MailPort | PushPort>> {
    switch (channel) {
      case "SMS":
        return this.resolveSmsWithConfigId();
      case "EMAIL":
        return this.resolveMailWithConfigId();
      case "PUSH":
        return this.resolvePushWithConfigId();
      case "WHATSAPP":
        return this.resolveWhatsappWithConfigId();
      case "INAPP":
        return { adapter: this.logOnlyAdapter, configId: null };
      /* istanbul ignore next -- exhaustive over CommChannel, unreachable at the type level */
      default: {
        const exhaustive: never = channel;
        throw new Error(`Unhandled comm channel: ${String(exhaustive)}`);
      }
    }
  }

  async resolveSms(): Promise<SmsPort> {
    return (await this.resolveSmsWithConfigId()).adapter;
  }

  async resolveSmsWithConfigId(): Promise<ResolvedAdapter<SmsPort>> {
    const enabled = await this.findEnabled("SMS");
    if (!enabled) return { adapter: this.logOnlyAdapter, configId: null };
    if (this.smsCache?.configId === enabled.id) return { adapter: this.smsCache.adapter, configId: enabled.id };

    const config = (await this.integrationConfigService.getDecryptedConfig(
      enabled.id,
    )) as unknown as GenericHttpSmsConfig;
    const adapter = new GenericHttpSmsAdapter(config);
    this.smsCache = { configId: enabled.id, adapter };
    return { adapter, configId: enabled.id };
  }

  async resolveMail(): Promise<MailPort> {
    return (await this.resolveMailWithConfigId()).adapter;
  }

  async resolveMailWithConfigId(): Promise<ResolvedAdapter<MailPort>> {
    const enabled = await this.findEnabled("SMTP");
    if (!enabled) return { adapter: this.logOnlyAdapter, configId: null };
    if (this.mailCache?.configId === enabled.id) return { adapter: this.mailCache.adapter, configId: enabled.id };

    const config = (await this.integrationConfigService.getDecryptedConfig(enabled.id)) as unknown as SmtpMailConfig;
    const adapter = new SmtpMailAdapter(config);
    this.mailCache = { configId: enabled.id, adapter };
    return { adapter, configId: enabled.id };
  }

  async resolvePush(): Promise<PushPort> {
    return (await this.resolvePushWithConfigId()).adapter;
  }

  async resolvePushWithConfigId(): Promise<ResolvedAdapter<PushPort>> {
    const enabled = await this.findEnabled("FCM");
    if (!enabled) return { adapter: this.logOnlyAdapter, configId: null };
    if (this.pushCache?.configId === enabled.id) return { adapter: this.pushCache.adapter, configId: enabled.id };

    const previous = this.pushCache?.adapter;
    if (previous instanceof FcmPushAdapter) {
      await previous.dispose().catch(() => undefined);
    }

    const config = (await this.integrationConfigService.getDecryptedConfig(enabled.id)) as unknown as FcmPushConfig;
    const adapter = new FcmPushAdapter(config);
    this.pushCache = { configId: enabled.id, adapter };
    return { adapter, configId: enabled.id };
  }

  async resolveWhatsapp(): Promise<SmsPort> {
    return (await this.resolveWhatsappWithConfigId()).adapter;
  }

  /**
   * `GenericHttpSmsAdapter` is already a fully generic, provider-agnostic
   * HTTP adapter (configurable endpoint/method/auth-header/body-template) —
   * exactly what a WhatsApp Business API integration (Meta's Cloud API, or
   * any BSP like Twilio/360dialog) needs, since a WhatsApp send is itself
   * just an authenticated HTTPS POST of a JSON payload. No separate adapter
   * class exists for WHATSAPP — this resolves a `kind='WHATSAPP'` config
   * through the SAME class SMS uses, just a different config row/cache.
   */
  async resolveWhatsappWithConfigId(): Promise<ResolvedAdapter<SmsPort>> {
    const enabled = await this.findEnabled("WHATSAPP");
    if (!enabled) return { adapter: this.logOnlyAdapter, configId: null };
    if (this.whatsappCache?.configId === enabled.id) return { adapter: this.whatsappCache.adapter, configId: enabled.id };

    const config = (await this.integrationConfigService.getDecryptedConfig(
      enabled.id,
    )) as unknown as GenericHttpSmsConfig;
    const adapter = new GenericHttpSmsAdapter(config);
    this.whatsappCache = { configId: enabled.id, adapter };
    return { adapter, configId: enabled.id };
  }

  private async findEnabled(kind: SetIntegrationKind): Promise<SetIntegrationConfigEntity | undefined> {
    const configs = await this.integrationConfigService.list();
    return configs.filter((c) => c.kind === kind && c.isEnabled).sort((a, b) => b.priority - a.priority)[0];
  }
}
