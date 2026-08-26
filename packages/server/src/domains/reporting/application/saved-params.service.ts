import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { RptSavedParamsEntity } from "../domain/rpt-saved-params.entity";
import { RptSavedParamsRepository } from "../infrastructure/rpt-saved-params.repository";

const PG_UNIQUE_VIOLATION = "23505";

export interface CreateSavedParamsInput {
  userId: string;
  reportCode: string;
  name: string;
  params: Record<string, unknown>;
}

export interface UpdateSavedParamsInput {
  name?: string;
  params?: Record<string, unknown>;
}

/**
 * CRUD for `rpt_saved_params` — a user's own named, reusable filter/parameter
 * set for a given report (e.g. "My Term 2 Class 4 Fee Statement"), per the
 * task brief. Every read/update/delete is scoped to the caller's own
 * `userId` — `rpt_saved_params` carries no sharing/visibility column at all
 * (see the entity's own doc comment), so "not mine" and "doesn't exist" are
 * deliberately indistinguishable from the outside: `get()`/`update()`/
 * `delete()` all raise the same `NotFoundException` for a saved-params row
 * that exists but belongs to a different user as for one that doesn't exist
 * at all, rather than a `403`, so a caller can never probe for another
 * user's saved report names by id.
 *
 * The `uq_rpt_saved_params_user_report_name` unique index (entity doc
 * comment) is DB-enforced; `create()` catches the Postgres `23505` violation
 * and translates it to a real `ConflictException` (409) — no shared/global
 * unique-violation interceptor exists anywhere in this codebase (confirmed
 * by reading `shared/exceptions/all-exceptions.filter.ts` directly), so this
 * mirrors the same per-service `PG_UNIQUE_VIOLATION` try/catch every sibling
 * service with a real uniqueness invariant already uses (e.g.
 * `procurement/application/quotations.service.ts`,
 * `payments/application/cashier-sessions.service.ts`).
 */
@Injectable()
export class SavedParamsService {
  constructor(private readonly repository: RptSavedParamsRepository) {}

  async create(input: CreateSavedParamsInput): Promise<RptSavedParamsEntity> {
    try {
      return await this.repository.create({
        userId: input.userId,
        reportCode: input.reportCode,
        name: input.name,
        params: input.params,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`A saved report named "${input.name}" already exists for ${input.reportCode}`);
      }
      throw error;
    }
  }

  async get(id: string, userId: string): Promise<RptSavedParamsEntity> {
    const row = await this.repository.findByIdOrFail(id);
    this.assertOwnedBy(row, id, userId);
    return row;
  }

  async listMine(userId: string): Promise<RptSavedParamsEntity[]> {
    return this.repository.listByUser(userId);
  }

  async update(id: string, userId: string, input: UpdateSavedParamsInput): Promise<RptSavedParamsEntity> {
    const row = await this.repository.findByIdOrFail(id);
    this.assertOwnedBy(row, id, userId);
    if (input.name !== undefined) row.name = input.name;
    if (input.params !== undefined) row.params = input.params;
    return this.repository.save(row);
  }

  async delete(id: string, userId: string): Promise<void> {
    const row = await this.repository.findByIdOrFail(id);
    this.assertOwnedBy(row, id, userId);
    await this.repository.delete(id);
  }

  /** See class doc comment — cross-user access is reported identically to "not found". */
  private assertOwnedBy(row: RptSavedParamsEntity, id: string, userId: string): void {
    if (row.userId !== userId) {
      throw new NotFoundException("RptSavedParams", id);
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}
