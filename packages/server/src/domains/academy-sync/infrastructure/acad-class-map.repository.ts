import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AcadClassMapEntity, AcadClassMapKind } from "../domain/acad-class-map.entity";

@Injectable()
export class AcadClassMapRepository {
  constructor(
    @InjectRepository(AcadClassMapEntity)
    private readonly repo: Repository<AcadClassMapEntity>,
  ) {}

  async find(kind: AcadClassMapKind, academyId: string): Promise<AcadClassMapEntity | null> {
    return this.repo.findOne({ where: { kind, academyId } });
  }

  async list(): Promise<AcadClassMapEntity[]> {
    return this.repo.find({ order: { kind: "ASC", academyName: "ASC" } });
  }

  async create(data: Partial<AcadClassMapEntity>): Promise<AcadClassMapEntity> {
    return this.repo.save(this.repo.create(data));
  }
}
