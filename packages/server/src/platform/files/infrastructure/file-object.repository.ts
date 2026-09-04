import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { FileObjectEntity } from "../domain/file-object.entity";

@Injectable()
export class FileObjectRepository {
  constructor(
    @InjectRepository(FileObjectEntity)
    private readonly repo: Repository<FileObjectEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<FileObjectEntity | null> {
    return (manager?.getRepository(FileObjectEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<FileObjectEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("FileObject", id);
    return row;
  }

  async listByEntity(entityType: string, entityId: string, manager?: EntityManager): Promise<FileObjectEntity[]> {
    return (manager?.getRepository(FileObjectEntity) ?? this.repo).find({
      where: { entityType, entityId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * The browsable, cross-entity list — every filter optional, matching
   * `entityType`/`entityId` becoming genuinely nullable at the API surface
   * (see `files.controller.ts`'s own doc comment). Copies
   * `UsrUserRepository.list()`'s exact query-builder shape. `listByEntity()`
   * above stays untouched, still used by `domains/expenses/application/vouchers.service.ts`.
   */
  async list(
    options: { entityType?: string; entityId?: string; q?: string; skip?: number; take?: number } = {},
  ): Promise<[FileObjectEntity[], number]> {
    const qb = this.repo.createQueryBuilder("f");
    if (options.entityType) {
      qb.andWhere("f.entityType = :entityType", { entityType: options.entityType });
    }
    if (options.entityId) {
      qb.andWhere("f.entityId = :entityId", { entityId: options.entityId });
    }
    if (options.q) {
      qb.andWhere("f.originalName ILIKE :q", { q: `%${options.q}%` });
    }
    qb.orderBy("f.createdAt", "DESC");
    if (options.skip !== undefined) qb.skip(options.skip);
    if (options.take !== undefined) qb.take(options.take);
    return qb.getManyAndCount();
  }

  async create(data: Partial<FileObjectEntity>, manager?: EntityManager): Promise<FileObjectEntity> {
    const repo = manager?.getRepository(FileObjectEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(FileObjectEntity) ?? this.repo).delete({ id });
  }
}
