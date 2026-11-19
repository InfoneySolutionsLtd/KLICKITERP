import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NtfEventSettingEntity } from "../domain/ntf-event-setting.entity";

@Injectable()
export class NtfEventSettingRepository {
  constructor(
    @InjectRepository(NtfEventSettingEntity)
    private readonly repo: Repository<NtfEventSettingEntity>,
  ) {}

  async findByCode(eventCode: string, manager?: EntityManager): Promise<NtfEventSettingEntity | null> {
    return (manager?.getRepository(NtfEventSettingEntity) ?? this.repo).findOne({ where: { eventCode } });
  }

  async list(manager?: EntityManager): Promise<NtfEventSettingEntity[]> {
    return (manager?.getRepository(NtfEventSettingEntity) ?? this.repo).find();
  }

  /** Creates the row on the first change; later changes update it. One row per event (unique index). */
  async upsert(eventCode: string, values: { isEnabled: boolean; roleIds: string[] }, actorId: string | null, manager?: EntityManager): Promise<NtfEventSettingEntity> {
    const repo = manager?.getRepository(NtfEventSettingEntity) ?? this.repo;
    const existing = await repo.findOne({ where: { eventCode } });
    if (existing) {
      existing.isEnabled = values.isEnabled;
      existing.roleIds = values.roleIds;
      existing.updatedBy = actorId;
      return repo.save(existing);
    }
    return repo.save(repo.create({ eventCode, isEnabled: values.isEnabled, roleIds: values.roleIds, createdBy: actorId, updatedBy: actorId }));
  }
}
