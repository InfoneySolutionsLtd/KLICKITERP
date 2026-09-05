"use client";

import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { LoginOutcome } from "@/lib/auth-types";
import type { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto, TwoFactorVerifyDto } from "@klickit/contracts";

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
