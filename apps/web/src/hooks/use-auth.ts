"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { LoginOutcome, SetupStatus, TwoFactorActivateResult, TwoFactorEnrollResult } from "@/lib/auth-types";
import type {
  ChangePasswordDto,
  CompleteFirstRunSetupDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  TwoFactorCodeDto,
  TwoFactorVerifyDto,
} from "@klickit/contracts";

/**
 * Request bodies are the REAL `@klickit/contracts` zod-generated types
 * (`LoginDto`/`TwoFactorVerifyDto`/`ChangePasswordDto`, mirroring
 * `packages/server`'s own class-validator DTOs field-for-field — never
 * hand-retyped). Response bodies are cast to `LoginOutcome`
 * (`lib/auth-types.ts`) since the OpenAPI document has no response schema
 * for these handlers (see `types/dashboard.ts`'s doc comment for the same
 * `content?: never` gap, true here too).
 */
export function useLogin() {
  return useMutation({
    mutationFn: async (dto: LoginDto) => unwrapApiResult<LoginOutcome>(await apiClient.POST("/api/v1/auth/login", { body: dto })),
  });
}

export function useVerify2fa() {
  return useMutation({
    mutationFn: async (dto: TwoFactorVerifyDto) => unwrapApiResult<LoginOutcome>(await apiClient.POST("/api/v1/auth/2fa/verify", { body: dto })),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (dto: ChangePasswordDto) =>
      unwrapApiResult<{ changed: boolean }>(await apiClient.POST("/api/v1/auth/password/change", { body: dto })),
  });
}

/** Always resolves — `PasswordService.forgotPassword()` gives a uniform response regardless of whether `identifier` matches a real account (no user enumeration). */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (dto: ForgotPasswordDto) =>
      unwrapApiResult<{ sent: true }>(await apiClient.POST("/api/v1/auth/password/forgot", { body: dto })),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (dto: ResetPasswordDto) =>
      unwrapApiResult<{ reset: true }>(await apiClient.POST("/api/v1/auth/password/reset", { body: dto })),
  });
}

/** `GET /auth/setup-status` — gates the pre-login first-run setup wizard (`app/(auth)/setup/page.tsx`), checked by `SetupStatusGate` in `(auth)/layout.tsx`. */
export function useSetupStatus() {
  return useQuery({
    queryKey: ["auth", "setup-status"] as const,
    queryFn: async () => unwrapApiResult<SetupStatus>(await apiClient.GET("/api/v1/auth/setup-status")),
  });
}

/** `POST /auth/setup/complete` — provisions this instance's first System Admin and mints a real session in one call; permanently refuses (409) once any System Admin already exists. */
export function useCompleteFirstRunSetup() {
  return useMutation({
    mutationFn: async (dto: CompleteFirstRunSetupDto) =>
      unwrapApiResult<LoginOutcome>(await apiClient.POST("/api/v1/auth/setup/complete", { body: dto })),
  });
}

/** `POST /auth/2fa/enroll` — requires a real session; the first-run wizard's optional 2FA step only reaches this after `useCompleteFirstRunSetup()` has already established one. */
export function useEnroll2fa() {
  return useMutation({
    mutationFn: async () => unwrapApiResult<TwoFactorEnrollResult>(await apiClient.POST("/api/v1/auth/2fa/enroll")),
  });
}

export function useActivate2fa() {
  return useMutation({
    mutationFn: async (dto: TwoFactorCodeDto) =>
      unwrapApiResult<TwoFactorActivateResult>(await apiClient.POST("/api/v1/auth/2fa/activate", { body: dto })),
  });
}
