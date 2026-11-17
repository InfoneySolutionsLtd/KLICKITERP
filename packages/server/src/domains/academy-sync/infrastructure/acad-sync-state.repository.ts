import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AcadSyncStateEntity } from "../domain/acad-sync-state.entity";

@Injectable()
export class AcadSyncStateRepository {
  constructor(
    @InjectRepository(AcadSyncStateEntity)
    private readonly repo: Repository<AcadSyncStateEntity>,
  ) {}

  /** The singleton row, created on first use. */
  async getOrCreate(): Promise<AcadSyncStateEntity> {
    const existing = await this.repo.findOne({ where: {} });
    if (existing) {
      return existing;
    }
    // `uq_acad_sync_state_singleton` makes a concurrent first call collide instead of creating a second row.
    try {
      return await this.repo.save(this.repo.create({ singleton: true, autoSyncEnabled: false }));
    } catch {
      return this.repo.findOneOrFail({ where: {} });
    }
  }

  async save(entity: AcadSyncStateEntity): Promise<AcadSyncStateEntity> {
    return this.repo.save(entity);
  }
}
