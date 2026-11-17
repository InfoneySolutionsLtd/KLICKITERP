import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AcadGuardianMapEntity } from "../domain/acad-guardian-map.entity";

@Injectable()
export class AcadGuardianMapRepository {
  constructor(
    @InjectRepository(AcadGuardianMapEntity)
    private readonly repo: Repository<AcadGuardianMapEntity>,
  ) {}

  async findByAcademyParentId(academyParentId: string): Promise<AcadGuardianMapEntity | null> {
    return this.repo.findOne({ where: { academyParentId } });
  }

  async create(data: Partial<AcadGuardianMapEntity>): Promise<AcadGuardianMapEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async save(entity: AcadGuardianMapEntity): Promise<AcadGuardianMapEntity> {
    return this.repo.save(entity);
  }
}
