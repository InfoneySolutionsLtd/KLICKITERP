import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BankExternalTransferDispatchEntity } from "../domain/bank-external-transfer-dispatch.entity";

@Injectable()
export class BankExternalTransferDispatchRepository {
  constructor(
    @InjectRepository(BankExternalTransferDispatchEntity)
    private readonly repo: Repository<BankExternalTransferDispatchEntity>,
  ) {}

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BankExternalTransferDispatchEntity> {
    const row = await (manager?.getRepository(BankExternalTransferDispatchEntity) ?? this.repo).findOne({ where: { id } });
    if (!row) throw new NotFoundException("BankExternalTransferDispatch", id);
    return row;
  }

  /** Newest attempt first. */
  async listForTransfer(transferId: string, manager?: EntityManager): Promise<BankExternalTransferDispatchEntity[]> {
    return (manager?.getRepository(BankExternalTransferDispatchEntity) ?? this.repo).find({ where: { transferId }, order: { createdAt: "DESC" } });
  }

  async create(data: Partial<BankExternalTransferDispatchEntity>, manager?: EntityManager): Promise<BankExternalTransferDispatchEntity> {
    const repo = manager?.getRepository(BankExternalTransferDispatchEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BankExternalTransferDispatchEntity, manager?: EntityManager): Promise<BankExternalTransferDispatchEntity> {
    return (manager?.getRepository(BankExternalTransferDispatchEntity) ?? this.repo).save(entity);
  }
}
