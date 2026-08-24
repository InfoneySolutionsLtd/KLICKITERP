"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTransportRouteDto, UpdateTransportRouteDto } from "@klickit/contracts";
import {
  activateTransportRoute,
  createTransportRoute,
  deactivateTransportRoute,
  getTransportRoute,
  listTransportRoutes,
  updateTransportRoute,
} from "../api/transport-routes.api";

export const TRANSPORT_ROUTES_QUERY_KEY = ["billing", "transport-routes"] as const;

function detailKey(id: string) {
  return [...TRANSPORT_ROUTES_QUERY_KEY, "detail", id] as const;
}

export function useTransportRoutes() {
  return useQuery({
    queryKey: TRANSPORT_ROUTES_QUERY_KEY,
    queryFn: listTransportRoutes,
  });
}

export function useTransportRoute(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getTransportRoute(id),
    enabled: !!id,
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: TRANSPORT_ROUTES_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateTransportRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTransportRouteDto) => createTransportRoute(dto),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateTransportRoute(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateTransportRouteDto) => updateTransportRoute(id, dto),
    onSuccess: () => invalidate(queryClient, id),
  });
}

export function useDeactivateTransportRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateTransportRoute(id),
    onSuccess: (_data, id) => invalidate(queryClient, id),
  });
}

export function useActivateTransportRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateTransportRoute(id),
    onSuccess: (_data, id) => invalidate(queryClient, id),
  });
}
