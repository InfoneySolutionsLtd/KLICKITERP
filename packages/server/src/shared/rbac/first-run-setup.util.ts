import { DataSource } from "typeorm";

/**
 * Answers "has this instance ever had its first System Admin provisioned?"
 * — the gate for the pre-login first-run setup wizard (school code -> OTP ->
 * create admin). Needed from TWO otherwise mutually-isolated modules:
 * `licensing` (`module-deps.json`: `mayImport: ["shared"]`, `importableBy: []`
 * — may import nothing else, and nothing may import it) and `platform/auth`.
 * Neither may reach `platform/users`' services from here, so this reads via
 * raw `DataSource.query()` instead — the exact same isolation-preserving
 * mechanism `shared/rbac/license-state.guard.ts` already uses to read
 * `license.v_state` without importing `licensing`. Raw SQL crosses no
 * TypeScript import boundary; only `import` statements are ESLint-checked
 * by `import/no-restricted-paths`.
 *
 * "System Admin" is checked by name, the same literal `tools/bootstrap-admin.ts`
 * already duplicates for its own "refuse to create a second System Admin"
 * safety check — that CLI script and this HTTP-reachable path independently
 * ask the identical logical question, a small acceptable duplication rather
 * than a shared constant neither module could import anyway.
 */
export async function isFirstRunSetupComplete(dataSource: DataSource): Promise<boolean> {
  const rows: unknown[] = await dataSource.query(
    `SELECT 1 FROM app.usr_user_role ur JOIN app.usr_role r ON r.id = ur.role_id WHERE r.name = 'System Admin' LIMIT 1`,
  );
  return rows.length > 0;
}
