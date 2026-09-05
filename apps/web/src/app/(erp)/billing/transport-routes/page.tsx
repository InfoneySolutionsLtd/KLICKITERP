"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { TransportRouteResponseDto } from "@klickit/contracts";
import { Eye, Plus, Receipt, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useTransportRoutes } from "@/features/billing/hooks/use-transport-routes";
import { TransportRouteDialog } from "@/features/billing/components/transport-route-dialog";

/**
 * Part 1 (Billing sub-features batch) — the Transport Routes list: a plain
 * `<DataTable>` inside `<QueryBoundary>` + a create dialog, same
 * clickable-row + explicit View button convention as every other new list
 * page in this batch.
 */
export default function TransportRoutesPage() {
  const t = useTranslations("billing.transportRoutes");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const routesQuery = useTransportRoutes();
  const [createOpen, setCreateOpen] = React.useState(false);

  const columns = React.useMemo<ColumnDef<TransportRouteResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("table.name") },
      { accessorKey: "amount", header: t("table.amount") },
      {
        id: "isActive",
        header: t("table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "soft-success" : "soft-destructive"}>
            {row.original.isActive ? tCommon("active") : tCommon("inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: tCommon("actions"),
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/billing/transport-routes/${row.original.id}`);
            }}
          >
            <Eye className="size-4" />
            {tCommon("view")}
          </Button>
        ),
      },
    ],
    [t, tCommon, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/billing/transport-routes/bill">
              <Receipt className="size-4" />
              {t("billTransport")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/billing/transport-routes/regenerate">
              <RotateCcw className="size-4" />
              {t("regenerateTransport")}
            </Link>
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("newRoute")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={routesQuery} isEmpty={(d) => d.length === 0}>
            {(routes) => (
              <DataTable columns={columns} data={routes} onRowClick={(route) => router.push(`/billing/transport-routes/${route.id}`)} />
            )}
          </QueryBoundary>
        </CardContent>
      </Card>

      <TransportRouteDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
