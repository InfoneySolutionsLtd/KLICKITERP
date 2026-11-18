/** BullMQ queue carrying only the periodic trigger for `AcademyPublishService.publishPending()` (invoices -> the parent portal). */
export const ACADEMY_PUBLISH_QUEUE = "academy-publish";
export const ACADEMY_PUBLISH_JOB_NAME = "publish";
/** Fixed, stable across restarts — re-adding the repeatable job on every worker boot does not create a duplicate schedule. */
export const ACADEMY_PUBLISH_REPEAT_JOB_ID = "academy-publish-repeatable";
