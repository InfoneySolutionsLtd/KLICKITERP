"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { SponsorResponseDto } from "@klickit/contracts";
import { Eye, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { useSponsors } from "@/features/billing/hooks/use-sponsors";
import { SponsorDialog } from "@/features/billing/components/sponsor-dialog";

/**
 * Part 1 (Billing sub-features batch) — the Sponsors list: a plain
 * `<DataTable>` inside `<QueryBoundary>` + a create dialog, same
 * clickable-row + explicit View button convention as every other new list
 * page in this batch. No status column/toggle — `SponsorsController` has no
 * activate/deactivate at all (confirmed by reading it), a sponsor is
 * permanent once created.
 */
export default function SponsorsPage() {
  const t = useTranslations("billing.sponsors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const sponsorsQuery = useSponsors();
  const [createOpen, setCreateOpen] = React.useState(false);

  const columns = React.useMemo<ColumnDef<SponsorResponseDto>[]>(
    () => [
      { accessorKey: "name", header: t("table.name") },
      {
        id: "agreementFileId",
        header: t("table.agreementFile"),
        cell: ({ row }) => (row.original.agreementFileId ? <Badge variant="soft-secondary">{t("table.hasAgreement")}</Badge> : "—"),
      },
      {
        id: "allowsCashConversion",
        header: t("table.allowsCashConversion"),
        cell: ({ row }) => (row.original.allowsCashConversion ? tCommon("active") : "—"),
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
              router.push(`/billing/sponsors/${row.original.id}`);
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
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t("newSponsor")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={sponsorsQuery} isEmpty={(d) => d.length === 0}>
            {(sponsors) => <DataTable columns={columns} data={sponsors} onRowClick={(sponsor) => router.push(`/billing/sponsors/${sponsor.id}`)} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      <SponsorDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
