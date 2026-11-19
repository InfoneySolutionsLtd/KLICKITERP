import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { NtfUserPreferenceEntity } from "../domain/ntf-user-preference.entity";

@Injectable()
export class NtfUserPreferenceRepository {
  constructor(
    @InjectRepository(NtfUserPreferenceEntity)
    private readonly repo: Repository<NtfUserPreferenceEntity>,
  ) {}

  async listForUser(userId: string, manager?: EntityManager): Promise<NtfUserPreferenceEntity[]> {
    return (manager?.getRepository(NtfUserPreferenceEntity) ?? this.repo).find({ where: { userId } });
  }

  /** Of `userIds`, the ones who switched `category` off. One query for all the recipients of an event. */
  async findUserIdsWithCategoryOff(userIds: string[], category: string, manager?: EntityManager): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await (manager?.getRepository(NtfUserPreferenceEntity) ?? this.repo).find({
      where: { userId: In(userIds), category, isEnabled: false },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  async upsert(userId: string, category: string, isEnabled: boolean, manager?: EntityManager): Promise<NtfUserPreferenceEntity> {
    const repo = manager?.getRepository(NtfUserPreferenceEntity) ?? this.repo;
    const existing = await repo.findOne({ where: { userId, category } });
    if (existing) {
      existing.isEnabled = isEnabled;
      existing.updatedBy = userId;
      return repo.save(existing);
    }
    return repo.save(repo.create({ userId, category, isEnabled, createdBy: userId, updatedBy: userId }));
  }
}
