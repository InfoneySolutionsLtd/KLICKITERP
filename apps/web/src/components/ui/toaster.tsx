"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, X, XCircle, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { subscribeToasts, TOAST_VIEWPORT_ATTRIBUTE, type ToastEvent, type ToastVariant } from "@/lib/toast-bus";

/**
 * The app's one toast: a short result message pinned to the TOP of the screen, where it is seen
 * whatever the page is scrolled to (an inline result card at the bottom of a long form is easy to
 * miss). Until now the app had no toast primitive at all — results were inline `<Alert>`s — so this
 * is deliberately small and dependency-free (framer-motion and lucide-react are already in the app).
 *
 * Mounted once in `app/providers.tsx`, so a toast survives a client-side navigation: a screen can
 * show "Generated 12 invoices" and then `router.push()` to another page, and the message is still
 * there on arrival.
 *
 * Behaviour:
 *  - success / info disappear on their own after a few seconds; a warning stays longer; an ERROR stays
 *    until it is dismissed (a failure that vanished by itself is one you can miss);
 *  - at most three are shown at once (the oldest is dropped);
 *  - the same message raised again within two seconds is shown once (a loop of identical calls — e.g. a
 *    wizard that creates several terms — must not stack a column of identical toasts);
 *  - besides the `useToast()` hook, the provider listens on `lib/toast-bus.ts`, which is how the
 *    app-wide mutation success / failure toasts (`lib/mutation-toast.ts`, fired from the QueryClient's
 *    `MutationCache`, outside React) reach the screen — translated with the current locale;
 *  - screen readers: errors and warnings are announced assertively (`role="alert"`), the rest politely;
 *  - never printed.
 *
 * Colours use the app's opaque `tint-*` tokens: a Tailwind `/NN` opacity modifier silently does
 * nothing on this app's raw-hex CSS-variable colours (see `components/layout/sidebar.tsx`).
 */

export type { ToastVariant };

export interface ToastOptions {
  /** Bold first line above the message. */
  title?: string;
  /** How long it stays, in ms; `0` = until dismissed. Defaults per variant. */
  durationMs?: number;
}

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
  title?: string;
}

export interface ToastApi {
  success: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  warning: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const DEFAULT_DURATION_MS: Record<ToastVariant, number> = { success: 6000, info: 6000, warning: 10000, error: 0 };
const MAX_VISIBLE = 3;
/** The same toast raised again inside this window is dropped. */
const DUPLICATE_WINDOW_MS = 2000;

const VARIANT_STYLES: Record<ToastVariant, { icon: LucideIcon; box: string; iconClass: string }> = {
  success: { icon: CheckCircle2, box: "border-success bg-tint-success", iconClass: "text-success" },
  error: { icon: XCircle, box: "border-destructive bg-tint-destructive", iconClass: "text-destructive" },
  warning: { icon: TriangleAlert, box: "border-warning bg-tint-warning", iconClass: "text-warning" },
  info: { icon: Info, box: "border-border bg-card", iconClass: "text-primary" },
};

const ToastContext = React.createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const recent = React.useRef(new Map<string, { id: number; at: number }>());
  // Root translator: lets bus events carry a message KEY (e.g. "toast.success.created").
  const tRoot = useTranslations();

  const dismiss = React.useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = React.useCallback(
    (variant: ToastVariant, message: string, options?: ToastOptions): number => {
      const now = Date.now();
      const key = `${variant}|${options?.title ?? ""}|${message}`;
      const earlier = recent.current.get(key);
      if (earlier && now - earlier.at < DUPLICATE_WINDOW_MS) return earlier.id;

      const id = nextId.current++;
      recent.current.set(key, { id, at: now });
      // Keep the duplicate-guard map from growing for the life of the session.
      for (const [oldKey, entry] of recent.current) {
        if (now - entry.at >= DUPLICATE_WINDOW_MS) recent.current.delete(oldKey);
      }
      setToasts((current) => [...current, { id, variant, message, title: options?.title }].slice(-MAX_VISIBLE));

      const duration = options?.durationMs ?? DEFAULT_DURATION_MS[variant];
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss],
  );

  // Toasts raised from outside React (the mutation cache) arrive on the bus.
  React.useEffect(() => {
    return subscribeToasts((event: ToastEvent) => {
      const message = event.message ?? (event.messageKey ? tRoot(event.messageKey, event.values) : "");
      if (!message) return;
      show(event.variant, message, { title: event.title, durationMs: event.durationMs });
    });
  }, [show, tRoot]);

  // Clear any pending auto-dismiss timers if the provider ever unmounts.
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (message, options) => show("success", message, options),
      error: (message, options) => show("error", message, options),
      warning: (message, options) => show("warning", message, options),
      info: (message, options) => show("info", message, options),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = React.useContext(ToastContext);
  if (!api) throw new Error("useToast() must be used inside <ToastProvider> (mounted in app/providers.tsx).");
  return api;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  const t = useTranslations("common");

  return (
    <div
      {...{ [TOAST_VIEWPORT_ATTRIBUTE]: "" }}
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 print:hidden"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { icon: Icon, box, iconClass } = VARIANT_STYLES[toast.variant];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              role={toast.variant === "error" || toast.variant === "warning" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm text-foreground shadow-lg",
                box,
              )}
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", iconClass)} aria-hidden />
              <div className="min-w-0 flex-1">
                {toast.title && <p className="font-semibold">{toast.title}</p>}
                <p className="break-words">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label={t("close")}
                className="-mr-1 shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
