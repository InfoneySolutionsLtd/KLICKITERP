import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankExternalTransferEntity, BankExternalTransferStatus } from "../domain/bank-external-transfer.entity";

export interface ListBankExternalTransfersFilter {
  status?: BankExternalTransferStatus;
  sourceAccountId?: string;
}

/** Plain repository wrapper for `bank_external_transfer`, mirroring `bank-transfer.repository.ts`'s exact shape. */
@Injectable()
export class BankExternalTransferRepository {
  constructor(
    @InjectRepository(BankExternalTransferEntity)
    private readonly repo: Repository<BankExternalTransferEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BankExternalTransferEntity | null> {
    return (manager?.getRepository(BankExternalTransferEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankExternalTransferEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BankExternalTransfer", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<BankExternalTransferEntity | null> {
    return (manager?.getRepository(BankExternalTransferEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(filter: ListBankExternalTransfersFilter = {}, manager?: EntityManager): Promise<BankExternalTransferEntity[]> {
    const repo = manager?.getRepository(BankExternalTransferEntity) ?? this.repo;
    const qb = repo.createQueryBuilder("t").orderBy("t.createdAt", "DESC");
    if (filter.status !== undefined) qb.andWhere("t.status = :status", { status: filter.status });
    if (filter.sourceAccountId !== undefined) {
      qb.andWhere("t.sourceAccountId = :sourceAccountId", { sourceAccountId: filter.sourceAccountId });
    }
    return qb.getMany();
  }

  async create(data: Partial<BankExternalTransferEntity>, manager?: EntityManager): Promise<BankExternalTransferEntity> {
    const repo = manager?.getRepository(BankExternalTransferEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankExternalTransferEntity, manager?: EntityManager): Promise<BankExternalTransferEntity> {
    return (manager?.getRepository(BankExternalTransferEntity) ?? this.repo).save(entity);
  }
}
