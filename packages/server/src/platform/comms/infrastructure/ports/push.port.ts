import { CommTestResult } from "./comm-test-result";
import { SendResult } from "./send-result";

/**
 * Ports & adapters boundary (docs/phase-3/02-communication-authentication.md
 * §1.5: `PushPort ── FcmAdapter`). `meta?.title` carries an optional push
 * notification title distinct from the body (FCM's `notification.title`).
 * `testConnection()` (FR-SET-003.1) must never push to a real device token
 * as a side effect — it only confirms the credentials authenticate.
 */
export interface PushPort {
  send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult>;
  testConnection(): Promise<CommTestResult>;
}
