"use client";

import * as React from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Overrides the toggle button's own classes — the default (`text-muted-foreground`) assumes a light background. */
  toggleClassName?: string;
}

/**
 * A password `<Input>` with a leading lock icon and a show/hide toggle —
 * `type` is switched between `"password"`/`"text"` on click, never a second
 * field. `tabIndex={-1}` on the toggle button keeps Tab order on the actual
 * form fields, not this cosmetic control. `pl-10`/`pr-10` on the input
 * reserve room so typed text never runs under either icon.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, toggleClassName, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Lock aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input ref={ref} type={visible ? "text" : "password"} className={cn("pl-10 pr-10", className)} {...props} />
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
