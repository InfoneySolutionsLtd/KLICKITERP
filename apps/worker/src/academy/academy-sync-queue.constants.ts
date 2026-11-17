/** BullMQ queue carrying only the periodic trigger for `AcademySyncService.runScheduled()` (the Academy student sync). */
export const ACADEMY_SYNC_QUEUE = "academy-sync";
export const ACADEMY_SYNC_JOB_NAME = "sync";
/** Fixed, stable across restarts — re-adding the repeatable job on every worker boot does not create a duplicate schedule. */
export const ACADEMY_SYNC_REPEAT_JOB_ID = "academy-sync-repeatable";
