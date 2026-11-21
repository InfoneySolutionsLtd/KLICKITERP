import { ApiError, parseFieldErrors } from "./api-error";
import { emitToast, type ToastEvent } from "./toast-bus";

/**
 * App-wide success / failure toasts for every TanStack Query mutation.
 *
 * `lib/query-client.ts` installs a `MutationCache` whose `onSuccess` / `onError` call the two functions
 * below, so a screen never wires its own "saved!" message — it just uses its mutation hook, and the hook
 * declares (in `meta`) what to say:
 *
 *   useMutation({ meta: { toast: "created" }, mutationFn: ... })          // "Created successfully"
 *   useMutation({ meta: { toast: "updated", successKey: "billing.feeCategories.toast.updated" }, ... })
 *   useMutation({ meta: { toast: false }, ... })                          // no success toast (the screen shows its own result)
 *
 * FAILURES are toasted for every mutation automatically (the toast stays until dismissed). A hook opts out
 * with `errorToast: false` only when its caller deliberately branches on the error (e.g. shows custom copy).
 *
 * A hook with no `meta` gets an error toast and no success toast — success messages are opt-in so a
 * background or multi-step call (a file upload that is one step of a bigger form, a "preview", a token
 * refresh) never announces itself.
 */

export const MUTATION_TOAST_KINDS = [
  "created",
  "updated",
  "deleted",
  "removed",
  "added",
  "submitted",
  "approved",
  "rejected",
  "decided",
  "posted",
  "activated",
  "deactivated",
  "published",
  "sent",
  "generated",
  "cancelled",
  "voided",
  "reversed",
  "requested",
  "recorded",
  "completed",
] as const;

export type MutationToastKind = (typeof MUTATION_TOAST_KINDS)[number];

export type MutationToastMeta = {
  /**
   * What the mutation did — picks the generic success message (`toast.success.<kind>`).
   * `false` = never announce success (the screen already shows its own result, or it is a background step).
   */
  toast?: MutationToastKind | false;
  /** A specific, root-relative message key for headline flows ("Fee structure published"); wins over `toast`'s generic text. */
  successKey?: string;
  /** `false` = don't toast a failure (the caller shows its own, more specific message). */
  errorToast?: false;
};

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: MutationToastMeta;
  }
}

/** The success toast for a finished mutation, or `null` when its `meta` doesn't ask for one. */
export function successToastFor(meta: MutationToastMeta | undefined): ToastEvent | null {
  if (!meta || meta.toast === false) return null;
  if (meta.successKey) return { variant: "success", messageKey: meta.successKey };
  if (meta.toast) return { variant: "success", messageKey: `toast.success.${meta.toast}` };
  return null;
}

/** Bare framework wording for a 401 / 403 — says nothing useful on its own, so the localized line is clearer. */
const UNHELPFUL_AUTH_MESSAGES = new Set(["", "forbidden", "forbidden resource", "unauthorized"]);

function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // fetch() rejects with a bare TypeError when the request never got a response. Check the wording too, so a
  // programming TypeError ("Cannot read properties of undefined") is not mislabelled as a connection problem.
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
}

/**
 * The error toast for a failed mutation, or `null` when the hook opted out. Server-provided messages are
 * shown as they are (they are what the inline banners already show); anything unhelpful or technical is
 * replaced with localized wording rather than leaking a stack-trace-flavoured message to a user.
 */
export function errorToastFor(error: unknown, meta: MutationToastMeta | undefined): ToastEvent | null {
  if (meta?.errorToast === false) return null;

  if (isNetworkFailure(error)) return { variant: "error", messageKey: "toast.error.network" };

  if (error instanceof ApiError) {
    // The Klickit Academy could not do what this ERP asked of it. The server words the reason for the admin (the Academy's own
    // message, or why it could not be reached), and a 503 here is not an ERP fault, so say it instead of "something went wrong
    // on our side". Checked before the status rules below: an Academy 401 (a rejected key) is not this person's session.
    if (error.code === "ACADEMY_GATEWAY_ERROR" && error.message.trim()) {
      return { variant: "error", messageKey: "toast.error.academy", values: { details: error.message.trim() } };
    }

    const plain = error.message.trim().toLowerCase();
    // A 401/403 that carries a real explanation ("Current password is incorrect", a separation-of-duties
    // message) is shown as written; only the bare framework wording is swapped for the localized line.
    if (error.status === 401 && UNHELPFUL_AUTH_MESSAGES.has(plain)) return { variant: "error", messageKey: "toast.error.sessionExpired" };
    if (error.status === 403 && UNHELPFUL_AUTH_MESSAGES.has(plain)) return { variant: "error", messageKey: "toast.error.permission" };
    if (error.status >= 500) return { variant: "error", messageKey: "toast.error.server" };

    const fieldMessages = Object.values(parseFieldErrors(error));
    if (fieldMessages.length > 0) {
      return { variant: "error", messageKey: "toast.error.validation", values: { details: fieldMessages.slice(0, 2).join("; ") } };
    }
    if (error.message.trim()) return { variant: "error", message: error.message };
  }

  return { variant: "error", messageKey: "toast.error.generic" };
}

export function notifyMutationSuccess(meta: MutationToastMeta | undefined): void {
  const toast = successToastFor(meta);
  if (toast) emitToast(toast);
}

export function notifyMutationError(error: unknown, meta: MutationToastMeta | undefined): void {
  const toast = errorToastFor(error, meta);
  if (toast) emitToast(toast);
}
