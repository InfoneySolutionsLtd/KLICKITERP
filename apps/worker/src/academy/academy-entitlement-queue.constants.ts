/** BullMQ queue carrying only `AcademyEntitlementService.checkEntitlement()`'s own periodic recheck trigger. */
export const ACADEMY_ENTITLEMENT_QUEUE = "academy-entitlement";
export const ACADEMY_ENTITLEMENT_JOB_NAME = "check";
/** Fixed, stable across restarts — BullMQ's repeatable-job registration is idempotent keyed on (name, repeat options, jobId); re-adding this on every worker boot does not create a duplicate schedule. */
export const ACADEMY_ENTITLEMENT_REPEAT_JOB_ID = "academy-entitlement-repeatable";
