"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import type { Delegation } from "@/features/approvals/types";
import { useDelegations } from "@/features/approvals/hooks/use-delegations";
import { useUsersLookup } from "@/features/approvals/hooks/use-users-lookup";
import { CreateDelegationDialog } from "@/features/approvals/components/create-delegation-dialog";
import { EditDelegationDialog } from "@/features/approvals/components/edit-delegation-dialog";
import { DeleteDelegationButton } from "@/features/approvals/components/delete-delegation-button";

/**
 * Approval-authority delegations (FR-APPR-005.1) — flat list, no detail page
 * (every field fits one row, matching Departments' own "no standalone route
 * when the parent screen already covers it" convention). Client-side search
 * over the resolved user names, same "small, unbounded dataset" shape
 * Roles/Workflows' own lists already established (`GET /approvals/delegations`
 * has no filters, confirmed by reading `DelegationsController` directly).
 */
export default function DelegationsPage() {
  const t = useTranslations("approvals.delegations.list");
  const delegationsQuery = useDelegations();
  const usersQuery = useUsersLookup();
  const [search, setSearch] = React.useState("");

  const userNameById = React.useMemo(() => new Map((usersQuery.data?.items ?? []).map((u) => [u.id, u.fullName])), [usersQuery.data]);

  const filterDelegations = React.useCallback(
    (delegations: Delegation[]) => {
      const term = search.trim().toLowerCase();
      if (!term) return delegations;
      return delegations.filter((d) => {
        const fromName = (userNameById.get(d.fromUserId) ?? "").toLowerCase();
        const toName = (userNameById.get(d.toUserId) ?? "").toLowerCase();
        return fromName.includes(term) || toName.includes(term) || (d.reason ?? "").toLowerCase().includes(term);
      });
    },
    [search, userNameById],
  );

  const columns = React.useMemo<ColumnDef<Delegation>[]>(
    () => [
      { id: "fromUser", header: t("columns.fromUser"), cell: ({ row }) => userNameById.get(row.original.fromUserId) ?? row.original.fromUserId },
      { id: "toUser", header: t("columns.toUser"), cell: ({ row }) => userNameById.get(row.original.toUserId) ?? row.original.toUserId },
      { id: "startsOn", header: t("columns.startsOn"), cell: ({ row }) => new Date(row.original.startsOn).toLocaleDateString() },
      { id: "endsOn", header: t("columns.endsOn"), cell: ({ row }) => new Date(row.original.endsOn).toLocaleDateString() },
      { id: "reason", header: t("columns.reason"), cell: ({ row }) => row.original.reason ?? "—" },
      {
        id: "actions",
        header: t("columns.actions"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <EditDelegationDialog delegation={row.original} />
            <DeleteDelegationButton delegation={row.original} />
          </div>
        ),
      },
    ],
    [t, userNameById],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateDelegationDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <QueryBoundary query={delegationsQuery} isEmpty={(d) => d.length === 0}>
            {(delegations) => {
              const filtered = filterDelegations(delegations);
              return filtered.length === 0 && search.trim() ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noResultsMatchSearch")}</p>
              ) : (
                <DataTable columns={columns} data={filtered} />
              );
            }}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
