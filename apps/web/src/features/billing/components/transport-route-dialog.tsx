"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { TransportRouteResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useCreateTransportRoute, useUpdateTransportRoute } from "../hooks/use-transport-routes";

/**
 * Create/edit `bill_transport_route` dialog+form — same plain
 * controlled-input `Dialog`/`useState` shape as `fee-category-dialog.tsx`.
 * Only 2 real fields (`name`, `amount`) — `UpdateTransportRouteDto` has no
 * `isActive` (confirmed by reading `transport-route.dto.ts`), activate/
 * deactivate lives on the detail page instead.
 *
 * `amount` is the flat fee the Bill Transport workflow charges each selected
 * student for this route (`POST billing/transport-routes/bill`) — no longer
 * a pure reference figure since the Transport Routes enhancement.
 *
 * `bus` (Transport Routes enhancement) — optional free-text vehicle
 * identifier (e.g. a plate number), not mandatory since not every route has
 * an assigned bus yet. Used by the route detail page's income-vs-expense
 * summary to help decide whether a specific bus, on a specific route, is
 * worth the expense it incurs.
 */
export function TransportRouteDialog({
  mode,
  route,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  route?: TransportRouteResponseDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("billing.transportRoutes.dialog");
  const tCommon = useTranslations("common");

  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [bus, setBus] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateTransportRoute();
  const updateMutation = useUpdateTransportRoute(route?.id ?? "");
  const pending = createMutation.isPending || updateMutation.isPending;

  React.useEffect(() => {
    if (open) {
      setName(route?.name ?? "");
      setAmount(route?.amount ?? "");
      setBus(route?.bus ?? "");
      setError(null);
    }
  }, [open, route]);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!amount.trim()) {
      setError(t("amountRequired"));
      return;
    }
    const busValue = bus.trim() || undefined;
    try {
      if (mode === "create") {
        await createMutation.mutateAsync({ name, amount, bus: busValue });
      } else {
        await updateMutation.mutateAsync({ name, amount, bus: busValue });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("titleCreate") : t("titleEdit")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("amount")}</Label>
            <MoneyInput value={amount} onValueChange={(v) => setAmount(v ?? "")} />
            <p className="text-xs text-muted-foreground">{t("amountHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("bus")}</Label>
            <Input value={bus} onChange={(e) => setBus(e.target.value)} maxLength={80} placeholder={t("busPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("busHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
