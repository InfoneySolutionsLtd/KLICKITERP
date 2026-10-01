import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AcademyLinkEntity } from "../domain/academy-link.entity";

/**
 * `license.academy_link` is a singular, per-instance table in practice —
 * same "most recent wins" convention as `LicenseRepository.findCurrent()`.
 */
@Injectable()
export class AcademyLinkRepository {
  constructor(
    @InjectRepository(AcademyLinkEntity)
    private readonly repo: Repository<AcademyLinkEntity>,
  ) {}

  async findCurrent(): Promise<AcademyLinkEntity | null> {
    return this.repo.findOne({ where: {}, order: { createdAt: "DESC" } });
  }

  /** Returns the current row, creating an empty one on first use (first "start onboarding" call). */
  async findCurrentOrCreate(): Promise<AcademyLinkEntity> {
    const existing = await this.findCurrent();
    if (existing) {
      return existing;
    }
    return this.repo.save(this.repo.create({}));
  }

  async save(entity: AcademyLinkEntity): Promise<AcademyLinkEntity> {
    return this.repo.save(entity);
  }
}
