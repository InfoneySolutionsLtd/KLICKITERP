import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { isFirstRunSetupComplete } from "../../../shared/rbac/first-run-setup.util";
import { RolesService } from "../../users/application/roles.service";
import { UsersService } from "../../users/application/users.service";
import { AuthService, LoginOutcome } from "./auth.service";

const SYSTEM_ADMIN_ROLE_NAME = "System Admin";

export interface CompleteFirstRunSetupInput {
  administratorEmail: string;
  administratorFirstName: string;
  administratorLastName: string;
  password: string;
}

/**
 * Backs the pre-login first-run setup wizard — provisions this instance's
 * FIRST System Admin directly from the browser, replacing the previous
 * "run `tools/bootstrap-admin.ts` from a shell" bootstrap path with an
 * equivalent HTTP one. Mirrors that CLI script's own `runCreate()` logic
 * (`UsersService.create()` + `RolesService.assignRoleToUser()`, role
 * resolved by name, `actorId: null` for "no actor, bootstrap operation")
 * closely enough that both paths independently enforce the identical
 * invariant: refuse once a System Admin already exists.
 *
 * Unlike the CLI's 3-separate-command flow (`create` -> log in with the
 * temp password -> `enroll-2fa`/`verify-2fa`), this sets the ADMIN'S OWN
 * chosen password directly (`UsersService.setInitialPassword()`, activating
 * the account immediately — no temp-password/forced-change dance) and mints
 * a full session in the same call via `AuthService.completeLoginAfter2fa()`,
 * the exact same "mint a session for this user id, no password re-check"
 * primitive `TwoFactorService.verify()` already uses after a login-time TOTP
 * check. 2FA enrollment itself needs no new backend surface — the existing
 * `POST /auth/2fa/enroll`/`/2fa/activate` already work once this method has
 * handed back a real session.
 */
@Injectable()
export class FirstRunSetupService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly authService: AuthService,
  ) {}

  async getStatus(): Promise<{ setupComplete: boolean }> {
    return { setupComplete: await isFirstRunSetupComplete(this.dataSource) };
  }

  async completeSetup(input: CompleteFirstRunSetupInput, ip: string, userAgent: string): Promise<LoginOutcome> {
    if (await isFirstRunSetupComplete(this.dataSource)) {
      throw new ConflictException("Setup has already been completed on this instance");
    }

    const username = await this.deriveUniqueUsername(input.administratorEmail);
    const fullName = `${input.administratorFirstName} ${input.administratorLastName}`.trim();

    const { user } = await this.usersService.create(
      { username, fullName, email: input.administratorEmail, userType: "SYSTEM" },
      null,
    );
    await this.usersService.setInitialPassword(user.id, input.password);

    const roles = await this.rolesService.list();
    const systemAdminRole = roles.find((role) => role.name === SYSTEM_ADMIN_ROLE_NAME);
    if (!systemAdminRole) {
      throw new Error(`"${SYSTEM_ADMIN_ROLE_NAME}" role not found — has migration 0900 run?`);
    }
    await this.rolesService.assignRoleToUser(user.id, systemAdminRole.id);

    return this.authService.completeLoginAfter2fa(user.id, ip, userAgent);
  }

  /** `"<local-part>@domain"` -> a safe, unique `usr_user.username` — collision is practically unreachable on a fresh install, handled defensively anyway. */
  private async deriveUniqueUsername(email: string): Promise<string> {
    const localPart = email.split("@")[0] ?? "admin";
    const base = localPart.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "admin";

    let candidate = base;
    let suffix = 1;
    while (await this.usersService.findByUsername(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}
