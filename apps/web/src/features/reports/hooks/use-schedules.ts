"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REPORTS_QUERY_KEY } from "./use-catalogue";
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listMySchedules,
  runSchedulesDue,
  updateSchedule,
  type ScheduleFormat,
} from "../api/schedules.api";

function schedulesListKey() {
  return [...REPORTS_QUERY_KEY, "schedules", "list"] as const;
}

function scheduleDetailKey(id: string | undefined) {
  return [...REPORTS_QUERY_KEY, "schedules", "detail", id] as const;
}

export function useMySchedules() {
  return useQuery({ queryKey: schedulesListKey(), queryFn: listMySchedules });
}

export function useSchedule(id: string | undefined) {
  return useQuery({ queryKey: scheduleDetailKey(id), queryFn: () => getSchedule(id as string), enabled: !!id });
}

function invalidateScheduleQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: schedulesListKey() });
  if (id) queryClient.invalidateQueries({ queryKey: scheduleDetailKey(id) });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportCode,
      params,
      cron,
      recipients,
      format,
    }: {
      reportCode: string;
      params: Record<string, unknown>;
      cron: string;
      recipients: string[];
      format: ScheduleFormat;
    }) => createSchedule(reportCode, params, cron, recipients, format),
    onSuccess: () => invalidateScheduleQueries(queryClient),
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { cron?: string; recipients?: string[]; isActive?: boolean } }) =>
      updateSchedule(id, dto),
    onSuccess: (updated) => invalidateScheduleQueries(queryClient, updated.id),
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSchedule(id),
    onSuccess: () => invalidateScheduleQueries(queryClient),
  });
}

/** Invalidates the whole list on success — `runDue()` can flip `lastRunAt`/`lastOk` on any number of active schedules. */
export function useRunSchedulesDue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asOfDate?: string) => runSchedulesDue(asOfDate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulesListKey() }),
  });
}
