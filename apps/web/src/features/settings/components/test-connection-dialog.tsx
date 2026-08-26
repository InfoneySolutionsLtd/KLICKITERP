"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { ACCOUNTING_SYNC_KINDS, testAccountingSyncConnection, type AccountingSyncKind } from "@/features/integrations/api/sync.api";
import { testCommsConnection, type TestableCommChannel } from "@/features/comms/api/test-connection.api";
import { useTestIntegrationConfigConnection } from "../hooks/use-integration-configs";
import type { IntegrationConfig, TestConnectionResult } from "../types";

function isAccountingSyncKind(kind: IntegrationConfig["kind"]): kind is AccountingSyncKind {
  return (ACCOUNTING_SYNC_KINDS as readonly string[]).includes(kind);
}

/** `IntegrationKind` (`SMTP`/`SMS`/`FCM`/`WHATSAPP`) -> `CommChannel` (`SMS`/`EMAIL`/`PUSH`/`WHATSAPP`) — `SMTP` maps to `EMAIL`, everything else is a same-name channel. `BANK`/`MPESA`/`QUICKBOOKS`/`XERO`/`SAGE` have no comms channel at all. */
const COMMS_TEST_CHANNEL_BY_KIND: Partial<Record<IntegrationConfig["kind"], TestableCommChannel>> = {
  SMTP: "EMAIL",
  SMS: "SMS",
  FCM: "PUSH",
  WHATSAPP: "WHATSAPP",
};

/**
 * FR-SET-003.1's "Test Connection button". A manual "Run test" step (not
 * auto-run on open) — same attempt-then-reveal shape every other mutating
 * confirm dialog in this app already uses (`<ClearChequeDialog>`, etc.), and
 * avoids re-triggering a real outbound network call every time this dialog
 * happens to be reopened.
 *
 * The result is carried IN a 2xx response body (`{ok, message}`), never an
 * HTTP error — `error` here only ever surfaces a genuine transport/auth/
 * permission failure of the TEST-CONNECTION CALL ITSELF, `result` surfaces
 * the real MPESA/stub outcome the plan asked to distinguish (a real Daraja
 * OAuth attempt now genuinely fails in this dev environment with no real
 * credentials/network — that is the expected, correct `result.ok === false`
 * case, shown here exactly as the server reported it, never re-worded).
 */
export function TestConnectionDialog({ config }: { config: IntegrationConfig }) {
  const t = useTranslations("settings.integrations");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<TestConnectionResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const testMutation = useTestIntegrationConfigConnection();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setResult(null);
      setError(null);
    }
  }

  async function handleRun() {
    setError(null);
    setResult(null);
    try {
      // QUICKBOOKS/XERO/SAGE have a real, working Test Connection of their
      // own under domains/integrations (AccountingSyncService.testConnection()),
      // and SMTP/SMS/FCM/WHATSAPP have one under platform/comms
      // (CommsTestConnectionController) — the generic settings-owned route
      // below is a permanent stub for all 7 of those kinds
      // (IntegrationConfigService.stubTestFor()), so routing to it here would
      // always show the fake "adapter not yet available" message even though
      // a real check is one call away. Only MPESA/BANK keep using the
      // generic route (MPESA's own real branch lives there already; BANK
      // still stubs).
      const commsChannel = COMMS_TEST_CHANNEL_BY_KIND[config.kind];
      if (isAccountingSyncKind(config.kind)) {
        setResult(await testAccountingSyncConnection(config.kind));
      } else if (commsChannel) {
        setResult(await testCommsConnection(commsChannel));
      } else {
        setResult(await testMutation.mutateAsync(config.id));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Zap className="size-4" />
          {t("testConnectionTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("testConnectionTitle", { name: config.name })}</DialogTitle>
          <DialogDescription>{t("testConnectionDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert variant={result.ok ? "success" : "destructive"}>
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("close")}
          </Button>
          <Button type="button" onClick={() => void handleRun()} disabled={testMutation.isPending}>
            {testMutation.isPending ? t("testing") : t("runTest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
