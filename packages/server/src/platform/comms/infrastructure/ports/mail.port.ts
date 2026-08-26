import { CommTestResult } from "./comm-test-result";
import { SendResult } from "./send-result";

/**
 * Ports & adapters boundary (docs/phase-3/02-communication-authentication.md
 * §1.5: `MailPort ── SmtpAdapter`). `meta?.subject` carries the rendered
 * subject line — kept out of the positional signature so every port
 * (`SmsPort`/`MailPort`/`PushPort`) shares one uniform `send(recipient,
 * body, meta?)` shape (task brief for this module). `testConnection()`
 * (FR-SET-003.1) must never send a real email as a side effect.
 */
export interface MailPort {
  send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult>;
  testConnection(): Promise<CommTestResult>;
}
