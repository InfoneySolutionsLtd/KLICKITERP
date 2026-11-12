"use client";

import * as React from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Overrides the toggle button's own classes — the default (`text-muted-foreground`) assumes a light background. */
  toggleClassName?: string;
  /**
   * Whether to draw the leading lock icon (default `true` — the login/setup
   * screens). Plain form grids that sit next to icon-less text inputs, such as
   * the Integrations credential forms, pass `false` so the field lines up with
   * its neighbours and only gains the show/hide toggle.
   */
  showLockIcon?: boolean;
}

/**
 * A password `<Input>` with an optional leading lock icon and a show/hide
 * toggle — `type` is switched between `"password"`/`"text"` on click, never a
 * second field. `tabIndex={-1}` on the toggle button keeps Tab order on the
 * actual form fields, not this cosmetic control. `pl-10`/`pr-10` on the input
 * reserve room so typed text never runs under either icon (`pl-10` only when
 * the lock icon is shown).
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, toggleClassName, showLockIcon = true, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        {showLockIcon && (
          <Lock aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input ref={ref} type={visible ? "text" : "password"} className={cn(showLockIcon ? "pl-10 pr-10" : "pr-10", className)} {...props} />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className={cn(
            "absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
            toggleClassName,
          )}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
