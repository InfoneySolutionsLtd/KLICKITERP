"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAcademyStatus,
  recheckAcademyEntitlement,
  startAcademyOnboarding,
  startFirstRunOnboarding,
  verifyAcademyOnboarding,
  verifyFirstRunOnboarding,
} from "../api/academy.api";

export const ACADEMY_QUERY_KEY = ["licensing", "academy"] as const;

/** `GET /license/academy/status` — read-only. */
export function useAcademyStatus() {
  return useQuery({
    queryKey: [...ACADEMY_QUERY_KEY, "status"] as const,
    queryFn: () => getAcademyStatus(),
  });
}

/** `POST /license/academy/onboarding/start` — submit the school code, Academy sends an OTP. */
export function useStartAcademyOnboarding() {
  return useMutation({
    mutationFn: (schoolCode: string) => startAcademyOnboarding(schoolCode),
  });
}

/** `POST /license/academy/onboarding/verify` — submit the OTP; on success, refetch status (now shows `connected: true`). */
export function useVerifyAcademyOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ schoolId, refId, code }: { schoolId: string; refId: string; code: string }) =>
      verifyAcademyOnboarding(schoolId, refId, code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACADEMY_QUERY_KEY }),
  });
}

/** `POST /license/academy/recheck` — force an immediate entitlement recheck. */
export function useRecheckAcademyEntitlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => recheckAcademyEntitlement(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACADEMY_QUERY_KEY }),
  });
}

/** `POST /license/academy/first-run/start` — the pre-login counterpart to `useStartAcademyOnboarding()`, used only by the first-run setup wizard. */
export function useStartFirstRunOnboarding() {
  return useMutation({
    mutationFn: (schoolCode: string) => startFirstRunOnboarding(schoolCode),
  });
}

/** `POST /license/academy/first-run/verify` — the pre-login counterpart to `useVerifyAcademyOnboarding()`. */
export function useVerifyFirstRunOnboarding() {
  return useMutation({
    mutationFn: ({ schoolId, refId, code }: { schoolId: string; refId: string; code: string }) =>
      verifyFirstRunOnboarding(schoolId, refId, code),
  });
}
