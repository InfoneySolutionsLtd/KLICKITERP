"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersForLookup } from "../api/users.api";

/** Backs the USERS-mode level approver `<MultiSelect>` and the delegation from/to `<Combobox>`s. Own query key namespaced under `["approvals", ...]`, mirroring `features/departments/hooks/use-users-lookup.ts`'s own narrow-lookup-not-shared-cache convention. */
export function useUsersLookup() {
  return useQuery({ queryKey: ["approvals", "users-lookup"] as const, queryFn: listUsersForLookup });
}
