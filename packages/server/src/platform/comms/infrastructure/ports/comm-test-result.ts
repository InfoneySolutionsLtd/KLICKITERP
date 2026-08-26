/**
 * Common result shape every port's `testConnection()` returns — mirrors
 * `domains/integrations`' own `AccountingSyncTestResult` shape exactly
 * (`{ok, message}`), shared by `SmsPort`/`MailPort`/`PushPort` for the same
 * reason `SendResult` is: a single result shape a caller can render/log the
 * same way regardless of which channel was tested.
 */
export interface CommTestResult {
  ok: boolean;
  message: string;
}
