/**
 * A tiny module-level channel between code that has no React context (the TanStack Query
 * `MutationCache`, created outside any component) and the one `<ToastProvider>` mounted in
 * `app/providers.tsx`, which subscribes here and renders the toasts.
 *
 * A message is EITHER final text (`message`) OR a root-relative i18n key (`messageKey`, e.g.
 * `"toast.success.created"`) that the provider translates with the user's current locale — so
 * non-React callers can raise translated toasts without a `useTranslations()` of their own.
 *
 * Nothing is queued: with no provider mounted (e.g. during server rendering) an event is dropped.
 * Toasts only ever follow a user action in the browser, so there is nothing to replay.
 */

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastEvent {
  variant: ToastVariant;
  /** Final, already-translated text. */
  message?: string;
  /** Root-relative message key, translated by the provider. Used when `message` is absent. */
  messageKey?: string;
  /** ICU values for `messageKey`. */
  values?: Record<string, string | number>;
  title?: string;
  /** Milliseconds on screen; `0` = until dismissed. Defaults per variant. */
  durationMs?: number;
}

/** Marks the toast container, so overlays can recognise a click that landed on a toast. */
export const TOAST_VIEWPORT_ATTRIBUTE = "data-toast-viewport";

/**
 * True when `target` is inside a toast. A modal `Dialog` treats any pointer-down outside its own React tree
 * as "dismiss" — and a toast lives outside it — so without this check, clicking the close button of an error
 * toast shown over an open form would also close the form and throw away what the user typed.
 */
export function isInsideToast(target: EventTarget | null | undefined): boolean {
  return target instanceof Element && target.closest(`[${TOAST_VIEWPORT_ATTRIBUTE}]`) !== null;
}

type Listener = (event: ToastEvent) => void;

let listener: Listener | null = null;

/** Called by `<ToastProvider>`. Returns the unsubscribe function. */
export function subscribeToasts(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

export function emitToast(event: ToastEvent): void {
  listener?.(event);
}
