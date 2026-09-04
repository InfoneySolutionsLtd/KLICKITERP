import type { LevelInputDto, RoutingRuleInputDto } from "@klickit/contracts";

/**
 * Client-side row state + row<->DTO mappers backing `<LevelRowEditor>`/
 * `<RoutingRuleRowEditor>` on the "Publish New Version" page. Mirrors
 * `features/accounting/lib/journal-lines.ts`'s exact shape (a pure,
 * `key`-stable row-array model + non-mutating update helpers), applied to
 * `LevelInputDto`/`RoutingRuleInputDto` instead of `JournalLineInputDto`.
 *
 * `seq` is deliberately NOT part of `LevelFormRow`'s own editable fields —
 * the backend's own doc comment defines it as "position within the workflow
 * version, ascending," so it is derived purely from array order at
 * serialization time (`levelRowsToDto`: `seq = index + 1`). This mirrors how
 * this same array is always displayed (top-to-bottom = execution order) and
 * avoids ever letting two rows collide on the same seq or leave a gap.
 */
export interface LevelFormRow {
  /** Client-only stable React key — never sent to the server. */
  key: string;
  approverType: "ROLE" | "USERS" | "DEPT_HEAD";
  roleId: string;
  userIds: string[];
  mode: "SEQUENTIAL" | "PARALLEL";
  quorum: number;
}

export function emptyLevelRow(): LevelFormRow {
  return { key: crypto.randomUUID(), approverType: "ROLE", roleId: "", userIds: [], mode: "SEQUENTIAL", quorum: 1 };
}

export function updateLevelRow(rows: LevelFormRow[], key: string, patch: Partial<LevelFormRow>): LevelFormRow[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

/** A level row is complete once its approverType-specific requirement is met — `roleId` for ROLE, at least one `userIds` entry for USERS, nothing extra for DEPT_HEAD (matches `LevelInputDto`'s own `@ValidateIf` shape exactly). */
export function isLevelRowComplete(row: LevelFormRow): boolean {
  if (row.approverType === "ROLE") return row.roleId.trim().length > 0;
  if (row.approverType === "USERS") return row.userIds.length > 0;
  return true;
}

export function levelRowsToDto(rows: LevelFormRow[]): LevelInputDto[] {
  return rows.map((row, index) => ({
    seq: index + 1,
    approverType: row.approverType,
    ...(row.approverType === "ROLE" ? { roleId: row.roleId } : {}),
    ...(row.approverType === "USERS" ? { userIds: row.userIds } : {}),
    mode: row.mode,
    quorum: row.quorum,
  }));
}

/** Decimal-string bounds only — `Money.fromDecimalString`'s accepted shape server-side, same `DECIMAL_PATTERN` the real `RoutingRuleInputDto` validates against. `levelSubset` is a set of `LevelFormRow` array-positions (1-based, matching `levelRowsToDto`'s own `seq` derivation) — empty means "all levels," never sent as `[]` (mirrors the real DTO's own "omit/null for all levels" semantics). */
export interface RoutingRuleFormRow {
  key: string;
  minAmount: string;
  maxAmount: string;
  levelSubset: number[];
  departmentId: string;
}

export function emptyRuleRow(): RoutingRuleFormRow {
  return { key: crypto.randomUUID(), minAmount: "", maxAmount: "", levelSubset: [], departmentId: "" };
}

export function updateRuleRow(rows: RoutingRuleFormRow[], key: string, patch: Partial<RoutingRuleFormRow>): RoutingRuleFormRow[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export function isRuleRowComplete(row: RoutingRuleFormRow): boolean {
  return DECIMAL_PATTERN.test(row.minAmount.trim());
}

export function ruleRowsToDto(rows: RoutingRuleFormRow[]): RoutingRuleInputDto[] {
  return rows.map((row) => ({
    minAmount: row.minAmount.trim(),
    ...(row.maxAmount.trim() ? { maxAmount: row.maxAmount.trim() } : {}),
    ...(row.levelSubset.length > 0 ? { levelSubset: row.levelSubset } : {}),
    ...(row.departmentId ? { departmentId: row.departmentId } : {}),
  }));
}
