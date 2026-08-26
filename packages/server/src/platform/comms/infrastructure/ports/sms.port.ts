import { CommTestResult } from "./comm-test-result";
import { SendResult } from "./send-result";

/**
 * Ports & adapters boundary (docs/phase-3/02-communication-authentication.md
 * §1.5: `SmsPort ─── AfricasTalkingAdapter | GenericHttpSmsAdapter |
 * (WhatsAppAdapter: reserved)`). This module ships `GenericHttpSmsAdapter`
 * (a real, provider-agnostic HTTP adapter, ALSO reused as-is for the WHATSAPP
 * channel — see `AdapterResolverService.resolveWhatsapp()` — since a WhatsApp
 * Business API send is itself just an authenticated HTTPS POST of a JSON
 * payload, no bespoke adapter needed) and `LogOnlyAdapter` (safe default) —
 * a dedicated Africa's Talking adapter is a future addition behind this same
 * interface, not a rewrite of any caller. `testConnection()` (FR-SET-003.1)
 * tests *connectivity*, not *delivery* — it must never send a real SMS/
 * WhatsApp message as a side effect of a "Test Connection" click.
 */
export interface SmsPort {
  send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult>;
  testConnection(): Promise<CommTestResult>;
}
