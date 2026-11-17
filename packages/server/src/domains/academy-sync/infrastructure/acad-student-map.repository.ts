import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { AcadStudentMapEntity } from "../domain/acad-student-map.entity";

@Injectable()
export class AcadStudentMapRepository {
  constructor(
    @InjectRepository(AcadStudentMapEntity)
    private readonly repo: Repository<AcadStudentMapEntity>,
  ) {}

  async findByAcademyIds(academyStudentIds: string[]): Promise<AcadStudentMapEntity[]> {
    if (academyStudentIds.length === 0) {
      return [];
    }
    return this.repo.find({ where: { academyStudentId: In(academyStudentIds) } });
  }

  async findByStudentId(studentId: string): Promise<AcadStudentMapEntity | null> {
    return this.repo.findOne({ where: { studentId } });
  }

  async create(data: Partial<AcadStudentMapEntity>): Promise<AcadStudentMapEntity> {
    return this.repo.save(this.repo.create(data));
  }

  async save(entity: AcadStudentMapEntity): Promise<AcadStudentMapEntity> {
    return this.repo.save(entity);
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  /** `[academyStudentId, removedInAcademy]` of every mapped student — what a FULL run compares against to spot who vanished. */
  async listAcademyIds(): Promise<Array<{ academyStudentId: string; studentId: string; removedInAcademy: boolean }>> {
    const rows = await this.repo.find({ select: { academyStudentId: true, studentId: true, removedInAcademy: true } });
    return rows.map((row) => ({
      academyStudentId: row.academyStudentId,
      studentId: row.studentId,
      removedInAcademy: row.removedInAcademy,
    }));
  }
}
