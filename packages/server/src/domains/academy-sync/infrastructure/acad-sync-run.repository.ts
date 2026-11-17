import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, Repository } from "typeorm";
import { AcadSyncRunEntity } from "../domain/acad-sync-run.entity";

@Injectable()
export class AcadSyncRunRepository {
  constructor(
    @InjectRepository(AcadSyncRunEntity)
    private readonly repo: Repository<AcadSyncRunEntity>,
  ) {}

  async create(data: Partial<AcadSyncRunEntity>): Promise<AcadSyncRunEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async save(entity: AcadSyncRunEntity): Promise<AcadSyncRunEntity> {
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<AcadSyncRunEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findRunning(): Promise<AcadSyncRunEntity | null> {
    return this.repo.findOne({ where: { status: "RUNNING" } });
  }

  async listRecent(limit: number): Promise<AcadSyncRunEntity[]> {
    return this.repo.find({ order: { startedAt: "DESC" }, take: limit });
  }

  /** The most recent run of the given mode that finished successfully. */
  async findLastSucceeded(mode: "PREVIEW" | "IMPORT"): Promise<AcadSyncRunEntity | null> {
    return this.repo.findOne({ where: { status: "SUCCEEDED", mode }, order: { startedAt: "DESC" } });
  }

  /** A run still RUNNING long after it started was lost to a crash or restart; mark it FAILED so it stops blocking new runs. */
  async failStale(startedBefore: Date): Promise<number> {
    const result = await this.repo.update(
      { status: "RUNNING", startedAt: LessThan(startedBefore) },
      { status: "FAILED", finishedAt: new Date(), error: "The run was interrupted (the process stopped before it finished)." },
    );
    return result.affected ?? 0;
  }
}
