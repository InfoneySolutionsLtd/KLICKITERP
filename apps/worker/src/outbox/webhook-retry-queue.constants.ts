/** BullMQ queue carrying only the webhook-delivery retry trigger — mirrors `outbox-queue.constants.ts`'s own shape exactly. */
export const WEBHOOK_RETRY_QUEUE = "webhook-retry";
export const WEBHOOK_RETRY_JOB_NAME = "retry";
/** Fixed, stable across restarts — same idempotent-repeatable-registration reasoning `OUTBOX_POLL_REPEAT_JOB_ID` documents. */
export const WEBHOOK_RETRY_REPEAT_JOB_ID = "webhook-retry-repeatable";
/** Not (yet) a configurable `AppConfigService` field — a fixed 60s cadence is more than fast enough against `WEBHOOK_BACKOFF_SCHEDULE_MINUTES`'s own coarsest step (1 minute), the same "good enough, not over-engineered" judgement call this pass's other new scheduling constants make. */
export const WEBHOOK_RETRY_INTERVAL_MS = 60_000;
