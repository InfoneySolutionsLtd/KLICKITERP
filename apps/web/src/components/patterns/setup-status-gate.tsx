"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSetupStatus } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

const SETUP_PATH = "/setup";

/**
 * The `(auth)` segment's counterpart to `<AuthGuard>` (which wraps `(erp)`) —
 * enforces both directions of "has this instance's first System Admin been
 * provisioned yet?" against `GET /auth/setup-status`:
 *  - NOT complete + anywhere except `/setup` -> redirect to `/setup`, even a
 *    direct visit to `/login`.
 *  - Complete + a direct visit to `/setup` -> redirect to `/login` (the
 *    wizard's own POST routes permanently 409 once setup is done, so
 *    rendering it at that point would just be confusing dead UI).
 * While the check is pending, renders a brief skeleton rather than flashing
 * the wrong screen before potentially redirecting — the same "checking"
 * treatment `<AuthGuard>` already established.
 */
export function SetupStatusGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, isPending } = useSetupStatus();

  const setupComplete = data?.setupComplete ?? true; // fail-open while loading/uncertain
  const onSetupPath = pathname === SETUP_PATH;
  const redirectTarget = !setupComplete && !onSetupPath ? SETUP_PATH : setupComplete && onSetupPath ? "/login" : null;

  React.useEffect(() => {
    if (redirectTarget) {
      router.replace(redirectTarget);
    }
  }, [redirectTarget, router]);

  if (isPending || redirectTarget) {
    return (
      <div className="w-full max-w-md space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
