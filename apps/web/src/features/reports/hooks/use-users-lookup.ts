"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersForLookup } from "../api/users-lookup.api";

/** Backs the Audit Log report's `actorId` `<Combobox>`. Own query key namespaced under `["reports", ...]`, not a shared Users cache. */
export function useUsersLookup() {
  return useQuery({ queryKey: ["reports", "users-lookup"] as const, queryFn: listUsersForLookup });
}
